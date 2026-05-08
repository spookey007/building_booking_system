"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2 } from "lucide-react";
import { bookingFormSchema, type BookingFormInput, type BookingFormValues } from "@/lib/validations/booking-form";
import { submitBookingDraftAction } from "@/lib/actions/booking-actions";
import { showError, showSuccess } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { cn } from "@/lib/utils";

const bookingModes = ["REGULAR", "TRANSFER", "CANCEL", "SWITCHING", "GIFT"] as const;
const modeOptions = bookingModes.map((m) => ({ label: m, value: m }));

const unitTypeOptions = [
  { label: "Residential", value: "RESIDENTIAL" },
  { label: "Commercial (shop)", value: "COMMERCIAL" },
  { label: "Penthouse", value: "PENTHOUSE" },
];

const sectionMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

function formatCnicInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

function getApplicantIdentityFromFormValues(
  cnicRaw: string,
  whatsapp: string,
  phoneRes: string,
  phoneOffice: string,
) {
  const normalizedCnic = formatCnicInput(cnicRaw);
  const cnicDigits = normalizedCnic.replace(/\D/g, "");
  const phoneCandidates = [whatsapp, phoneRes, phoneOffice]
    .map((value) => (value ?? "").replace(/\D/g, "").slice(-12))
    .filter((value) => value.length >= 10);
  const phoneDigits = phoneCandidates[0] ?? "";
  const identityKey =
    cnicDigits.length === 13 ? `cnic:${cnicDigits}` : phoneDigits ? `phone:${phoneDigits}` : "";
  return { identityKey, normalizedCnic, cnicDigits, phoneDigits };
}

function parseFormattedNumber(value: string | number | undefined | null) {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatWithCommas(value: string | number | undefined | null) {
  if (value === undefined || value === null || value === "") return "";
  const raw = String(value).replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!raw) return "";
  const trailingDot = raw.endsWith(".");
  const [intPartRaw, decPartRaw = ""] = raw.split(".");
  const intPart = intPartRaw ? Number.parseInt(intPartRaw, 10).toLocaleString("en-US") : "0";
  if (trailingDot) return `${intPart}.`;
  return decPartRaw ? `${intPart}.${decPartRaw}` : intPart;
}

type BookingFormProps = {
  projects: { code: string; name: string }[];
  compact?: boolean;
  hideTopBar?: boolean;
  showModeSelector?: boolean;
  enableTransferSwitchActions?: boolean;
  onSuccess?: () => void;
  initialValues?: Partial<BookingFormInput>;
  readOnly?: boolean;
  submitLabel?: string;
  /** When set (e.g. edit existing booking), unit search also returns this unit even if already BOOKED. */
  unitSearchIncludeId?: string;
  onTransferAction?: (values: BookingFormValues) => Promise<{ ok: boolean; message: string; fieldErrors?: Record<string, string[]> }>;
  onSwitchAction?: (values: BookingFormValues) => Promise<{ ok: boolean; message: string; fieldErrors?: Record<string, string[]> }>;
  onSubmitAction?: (values: BookingFormValues) => Promise<{ ok: boolean; message: string; fieldErrors?: Record<string, string[]> }>;
};

type SectionKey = "booking" | "unit" | "applicant" | "nominee" | "finance";
type UnitSearchResult = {
  id: string;
  projectCode: string;
  projectName: string;
  displayLabel: string;
  unitNo: string;
  towerCode: string;
  prefix: string;
  floorNo: number | "";
  category: string;
  unitType: "RESIDENTIAL" | "COMMERCIAL" | "PENTHOUSE";
  size: string;
  rooms: number | "";
  facing: string;
  basePrice: string;
  transferCharges: string;
};

type CustomerLookupResult = {
  fullName: string;
  fatherHusband: string;
  phoneOffice: string;
  phoneRes: string;
  whatsapp: string;
  email: string;
  cnic: string;
  passportNo: string;
  nationality: string;
  postalAddress: string;
  income: string;
  age: string;
  occupation: string;
  broker: string;
  careOf: string;
  nomineeName: string;
  relation: string;
  nomineeFatherName: string;
  nomineeAddress: string;
  nomineeCnic: string;
  nomineePassport: string;
  nomineeCell: string;
};

type NomineeLookupResult = {
  nomineeName: string;
  relation: string;
  nomineeFatherName: string;
  nomineeAddress: string;
  nomineeCnic: string;
  nomineePassport: string;
  nomineeCell: string;
};

type BookingOperation = "REGULAR" | "TRANSFER" | "SWITCHING";

export function BookingForm({
  projects,
  compact = false,
  hideTopBar = false,
  showModeSelector = false,
  enableTransferSwitchActions = false,
  onSuccess,
  initialValues,
  readOnly = false,
  submitLabel = "Save Booking",
  unitSearchIncludeId,
  onTransferAction,
  onSwitchAction,
  onSubmitAction,
}: BookingFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [unitQuery, setUnitQuery] = useState("");
  const [unitResults, setUnitResults] = useState<UnitSearchResult[]>([]);
  const [isUnitLoading, setIsUnitLoading] = useState(false);
  const [showUnitResults, setShowUnitResults] = useState(false);
  const [bookingOperation, setBookingOperation] = useState<BookingOperation>("REGULAR");
  const [isCustomerLookupLoading, setIsCustomerLookupLoading] = useState(false);
  const [customerLookupMessage, setCustomerLookupMessage] = useState("");
  const [applicantLockedFromLookup, setApplicantLockedFromLookup] = useState(false);
  const [nomineeLockedFromLookup, setNomineeLockedFromLookup] = useState(false);
  const [isNomineeLookupLoading, setIsNomineeLookupLoading] = useState(false);
  const [nomineeLookupMessage, setNomineeLookupMessage] = useState("");
  const customerLookupCacheRef = useRef<Record<string, CustomerLookupResult | null>>({});
  const nomineeLookupCacheRef = useRef<Record<string, NomineeLookupResult | null>>({});
  const applicantLockIdentityRef = useRef<string | null>(null);
  const nomineeLockCnicDigitsRef = useRef<string | null>(null);
  const customerLookupAbortRef = useRef<AbortController | null>(null);
  const nomineeLookupAbortRef = useRef<AbortController | null>(null);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(() =>
    compact
      ? { booking: true, unit: false, applicant: false, nominee: false, finance: false }
      : { booking: true, unit: true, applicant: true, nominee: true, finance: true },
  );
  const defaultValues = useMemo<BookingFormInput>(
    () => ({
      bookingDate: initialValues?.bookingDate ?? new Date().toISOString().slice(0, 10),
      mode: initialValues?.mode ?? "REGULAR",
      transferDate: initialValues?.transferDate ?? "",
      switchingDate: initialValues?.switchingDate ?? "",
      switchToUnitNo: initialValues?.switchToUnitNo ?? "",
      cancelDate: initialValues?.cancelDate ?? "",
      projectCode: initialValues?.projectCode ?? projects[0]?.code ?? "",
      unitNo: initialValues?.unitNo ?? "",
      tower: initialValues?.tower ?? "",
      floorNo: initialValues?.floorNo ?? "",
      category: initialValues?.category ?? "",
      unitType: initialValues?.unitType ?? "RESIDENTIAL",
      size: initialValues?.size ?? "",
      rooms: initialValues?.rooms ?? "",
      facing: initialValues?.facing ?? "",
      fullName: initialValues?.fullName ?? "",
      fatherHusband: initialValues?.fatherHusband ?? "",
      postalAddress: initialValues?.postalAddress ?? "",
      phoneOffice: initialValues?.phoneOffice ?? "",
      phoneRes: initialValues?.phoneRes ?? "",
      whatsapp: initialValues?.whatsapp ?? "",
      email: initialValues?.email ?? undefined,
      income: initialValues?.income ?? "",
      age: initialValues?.age ?? "",
      nationality: initialValues?.nationality ?? "PAKISTANI",
      cnic: initialValues?.cnic ?? undefined,
      passportNo: initialValues?.passportNo ?? undefined,
      occupation: initialValues?.occupation ?? "",
      broker: initialValues?.broker ?? "",
      careOf: initialValues?.careOf ?? "",
      nomineeName: initialValues?.nomineeName ?? "",
      relation: initialValues?.relation ?? "",
      nomineeFatherName: initialValues?.nomineeFatherName ?? "",
      nomineeAddress: initialValues?.nomineeAddress ?? "",
      nomineeCnic: initialValues?.nomineeCnic ?? undefined,
      nomineePassport: initialValues?.nomineePassport ?? undefined,
      nomineeCell: initialValues?.nomineeCell ?? undefined,
      priceOfUnit: initialValues?.priceOfUnit ?? "0",
      cashPayable: initialValues?.cashPayable ?? "0",
      discountAmount: initialValues?.discountAmount ?? "0",
      transferCharges: initialValues?.transferCharges ?? "0",
      expectedLoan: initialValues?.expectedLoan ?? undefined,
      grossTotal: initialValues?.grossTotal ?? "0",
      payableCost: initialValues?.payableCost ?? "0",
    }),
    [initialValues, projects],
  );

  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<BookingFormInput, unknown, BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    mode: "onBlur",
    defaultValues,
  });

  const mode = useWatch({ control, name: "mode" });
  const selectedProjectCode = useWatch({ control, name: "projectCode" }) ?? "";
  const unitTypeValue = useWatch({ control, name: "unitType" }) ?? "RESIDENTIAL";
  const cnicValue = useWatch({ control, name: "cnic" }) ?? "";
  const whatsappValue = useWatch({ control, name: "whatsapp" }) ?? "";
  const phoneResValue = useWatch({ control, name: "phoneRes" }) ?? "";
  const phoneOfficeValue = useWatch({ control, name: "phoneOffice" }) ?? "";
  const nomineeCnicValue = useWatch({ control, name: "nomineeCnic" }) ?? "";
  const priceOfUnit = useWatch({ control, name: "priceOfUnit" });
  const discountAmount = useWatch({ control, name: "discountAmount" });
  const cashPayable = useWatch({ control, name: "cashPayable" });
  const transferCharges = useWatch({ control, name: "transferCharges" });
  const showSwitchFields = mode === "SWITCHING";
  const showTransferDate = mode === "TRANSFER";
  const showCancelDate = mode === "CANCEL";
  const isTransferMode = mode === "TRANSFER";
  const unitPriceAmount = parseFormattedNumber(priceOfUnit);
  const transferAmount = isTransferMode ? parseFormattedNumber(transferCharges) : 0;
  const discountAmountValue = parseFormattedNumber(discountAmount);
  const cashPayableAmount = parseFormattedNumber(cashPayable);
  const grossTotalAmount = Math.max(0, unitPriceAmount + transferAmount - discountAmountValue);
  const payableCostAmount = Math.max(0, grossTotalAmount + cashPayableAmount);
  /** Lock prefilled applicant data; keep CNIC + phone fields editable for further search. */
  const applicantOtherReadOnly = readOnly || applicantLockedFromLookup;
  /** Lock prefilled nominee data; keep nominee CNIC editable for search. */
  const nomineeOtherReadOnly = readOnly || nomineeLockedFromLookup;
  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const clearApplicantAndNominee = useCallback(() => {
    setValue("fullName", "", { shouldValidate: true, shouldDirty: true });
    setValue("fatherHusband", "", { shouldValidate: true, shouldDirty: true });
    setValue("postalAddress", "", { shouldValidate: true, shouldDirty: true });
    setValue("phoneOffice", "", { shouldValidate: true, shouldDirty: true });
    setValue("phoneRes", "", { shouldValidate: true, shouldDirty: true });
    setValue("whatsapp", "", { shouldValidate: true, shouldDirty: true });
    setValue("email", undefined, { shouldValidate: true, shouldDirty: true });
    setValue("cnic", undefined, { shouldValidate: true, shouldDirty: true });
    setValue("passportNo", undefined, { shouldValidate: true, shouldDirty: true });
    setValue("occupation", "", { shouldValidate: true, shouldDirty: true });
    setValue("nationality", "PAKISTANI", { shouldValidate: true, shouldDirty: true });
    setValue("income", "", { shouldValidate: true, shouldDirty: true });
    setValue("age", "", { shouldValidate: true, shouldDirty: true });
    setValue("broker", "", { shouldValidate: true, shouldDirty: true });
    setValue("careOf", "", { shouldValidate: true, shouldDirty: true });

    setValue("nomineeName", "", { shouldValidate: true, shouldDirty: true });
    setValue("relation", "", { shouldValidate: true, shouldDirty: true });
    setValue("nomineeFatherName", "", { shouldValidate: true, shouldDirty: true });
    setValue("nomineeAddress", "", { shouldValidate: true, shouldDirty: true });
    setValue("nomineeCnic", undefined, { shouldValidate: true, shouldDirty: true });
    setValue("nomineePassport", undefined, { shouldValidate: true, shouldDirty: true });
    setValue("nomineeCell", undefined, { shouldValidate: true, shouldDirty: true });
    setApplicantLockedFromLookup(false);
    setNomineeLockedFromLookup(false);
    applicantLockIdentityRef.current = null;
    nomineeLockCnicDigitsRef.current = null;
  }, [setValue]);

  const activateOperation = useCallback(
    (next: BookingOperation) => {
      if (readOnly) return;
      if (next === "TRANSFER") {
        const confirmed = window.confirm(
          "Transfer to another customer? Existing primary applicant and nominee details will be cleared.",
        );
        if (!confirmed) return;
        clearApplicantAndNominee();
      }
      if (next === "SWITCHING") {
        const confirmed = window.confirm(
          "Switch to another unit? Existing primary applicant and nominee details will be cleared from current booking and captured for the switched booking.",
        );
        if (!confirmed) return;
        clearApplicantAndNominee();
      }

      setBookingOperation(next);
      setValue("mode", next, { shouldValidate: true, shouldDirty: true });
      if (next === "REGULAR") {
        setValue("switchToUnitNo", "", { shouldValidate: true, shouldDirty: true });
        setValue("switchingDate", "", { shouldValidate: true, shouldDirty: true });
        setValue("transferDate", "", { shouldValidate: true, shouldDirty: true });
      }
    },
    [clearApplicantAndNominee, readOnly, setValue],
  );

  const applyCustomerAutofill = useCallback(
    (customer: CustomerLookupResult, identityKey: string) => {
      setValue("fullName", customer.fullName, { shouldValidate: true, shouldDirty: true });
      setValue("fatherHusband", customer.fatherHusband, { shouldValidate: true, shouldDirty: true });
      setValue("phoneOffice", customer.phoneOffice, { shouldValidate: true, shouldDirty: true });
      setValue("phoneRes", customer.phoneRes, { shouldValidate: true, shouldDirty: true });
      setValue("whatsapp", customer.whatsapp, { shouldValidate: true, shouldDirty: true });
      setValue("email", customer.email || undefined, { shouldValidate: true, shouldDirty: true });
      setValue("cnic", formatCnicInput(customer.cnic), { shouldValidate: true, shouldDirty: true });
      setValue("passportNo", customer.passportNo || undefined, { shouldValidate: true, shouldDirty: true });
      setValue("nationality", customer.nationality, { shouldValidate: true, shouldDirty: true });
      setValue("postalAddress", customer.postalAddress, { shouldValidate: true, shouldDirty: true });
      setValue("income", customer.income || "", { shouldValidate: true, shouldDirty: true });
      setValue("age", customer.age || "", { shouldValidate: true, shouldDirty: true });
      setValue("occupation", customer.occupation, { shouldValidate: true, shouldDirty: true });
      setValue("broker", customer.broker, { shouldValidate: true, shouldDirty: true });
      setValue("careOf", customer.careOf, { shouldValidate: true, shouldDirty: true });

      setApplicantLockedFromLookup(true);
      applicantLockIdentityRef.current = identityKey;
    },
    [setValue],
  );

  const applyNomineeOnlyAutofill = useCallback(
    (nominee: NomineeLookupResult, cnicDigits: string) => {
      setValue("nomineeName", nominee.nomineeName, { shouldValidate: true, shouldDirty: true });
      setValue("relation", nominee.relation, { shouldValidate: true, shouldDirty: true });
      setValue("nomineeFatherName", nominee.nomineeFatherName, { shouldValidate: true, shouldDirty: true });
      setValue("nomineeAddress", nominee.nomineeAddress, { shouldValidate: true, shouldDirty: true });
      setValue("nomineeCnic", formatCnicInput(nominee.nomineeCnic), { shouldValidate: true, shouldDirty: true });
      setValue("nomineePassport", nominee.nomineePassport || undefined, { shouldValidate: true, shouldDirty: true });
      setValue("nomineeCell", nominee.nomineeCell || undefined, { shouldValidate: true, shouldDirty: true });
      setNomineeLockedFromLookup(true);
      nomineeLockCnicDigitsRef.current = cnicDigits;
    },
    [setValue],
  );

  const runCustomerLookup = useCallback(async () => {
    if (readOnly) return;
    customerLookupAbortRef.current?.abort();
    const controller = new AbortController();
    customerLookupAbortRef.current = controller;

    const v = getValues();
    const { identityKey, normalizedCnic, cnicDigits, phoneDigits } = getApplicantIdentityFromFormValues(
      v.cnic ?? "",
      v.whatsapp ?? "",
      v.phoneRes ?? "",
      v.phoneOffice ?? "",
    );

    if (!identityKey) {
      setCustomerLookupMessage("Enter a full CNIC (13 digits) or a phone number (10+ digits), then press Enter.");
      return;
    }

    const cached = customerLookupCacheRef.current[identityKey];
    if (cached !== undefined) {
      if (cached) {
        applyCustomerAutofill(cached, identityKey);
        setCustomerLookupMessage("Existing customer found. Details loaded.");
      } else {
        setApplicantLockedFromLookup(false);
        applicantLockIdentityRef.current = null;
        setCustomerLookupMessage("No existing customer found for this identity.");
      }
      return;
    }

    try {
      setIsCustomerLookupLoading(true);
      setCustomerLookupMessage("");
      const params = new URLSearchParams();
      if (cnicDigits.length === 13) {
        params.set("cnic", normalizedCnic);
      } else if (phoneDigits) {
        params.set("phone", phoneDigits);
      }
      const response = await fetch(`/api/customers/by-cnic?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Lookup failed");
      const data = (await response.json()) as { customer?: CustomerLookupResult | null };
      const customer = data.customer ?? null;

      const after = getApplicantIdentityFromFormValues(
        getValues("cnic") ?? "",
        getValues("whatsapp") ?? "",
        getValues("phoneRes") ?? "",
        getValues("phoneOffice") ?? "",
      );
      if (after.identityKey !== identityKey) return;

      customerLookupCacheRef.current[identityKey] = customer;
      if (customer) {
        applyCustomerAutofill(customer, identityKey);
        setCustomerLookupMessage("Existing customer found. Details loaded.");
      } else {
        setApplicantLockedFromLookup(false);
        applicantLockIdentityRef.current = null;
        setCustomerLookupMessage("No existing customer found for this identity.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCustomerLookupMessage("Unable to check customer right now.");
    } finally {
      if (customerLookupAbortRef.current === controller) {
        setIsCustomerLookupLoading(false);
      }
    }
  }, [applyCustomerAutofill, getValues, readOnly]);

  const runNomineeLookup = useCallback(async () => {
    if (readOnly) return;
    nomineeLookupAbortRef.current?.abort();
    const controller = new AbortController();
    nomineeLookupAbortRef.current = controller;

    const raw = getValues("nomineeCnic") ?? "";
    const normalizedNomineeCnic = formatCnicInput(raw);
    const nomineeDigits = normalizedNomineeCnic.replace(/\D/g, "");
    const nomineeKey = nomineeDigits.length === 13 ? `cnic:${nomineeDigits}` : "";

    if (!nomineeKey) {
      setNomineeLookupMessage("Enter a full nominee CNIC (13 digits), then press Enter.");
      return;
    }

    const cached = nomineeLookupCacheRef.current[nomineeKey];
    if (cached !== undefined) {
      if (cached) {
        applyNomineeOnlyAutofill(cached, nomineeDigits);
        setNomineeLookupMessage("Existing nominee found. Details loaded.");
      } else {
        setNomineeLockedFromLookup(false);
        nomineeLockCnicDigitsRef.current = null;
        setNomineeLookupMessage("No saved nominee found for this CNIC.");
      }
      return;
    }

    try {
      setIsNomineeLookupLoading(true);
      setNomineeLookupMessage("");
      const params = new URLSearchParams({ cnic: normalizedNomineeCnic });
      const response = await fetch(`/api/nominees/by-cnic?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Nominee lookup failed");
      const data = (await response.json()) as { nominee?: NomineeLookupResult | null };
      const nominee = data.nominee ?? null;

      const afterDigits = formatCnicInput(getValues("nomineeCnic") ?? "").replace(/\D/g, "");
      if (afterDigits !== nomineeDigits) return;

      nomineeLookupCacheRef.current[nomineeKey] = nominee;
      if (nominee) {
        applyNomineeOnlyAutofill(nominee, nomineeDigits);
        setNomineeLookupMessage("Existing nominee found. Details loaded.");
      } else {
        setNomineeLockedFromLookup(false);
        nomineeLockCnicDigitsRef.current = null;
        setNomineeLookupMessage("No saved nominee found for this CNIC.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNomineeLookupMessage("Unable to check nominee right now.");
    } finally {
      if (nomineeLookupAbortRef.current === controller) {
        setIsNomineeLookupLoading(false);
      }
    }
  }, [applyNomineeOnlyAutofill, getValues, readOnly]);

  const onSubmit = async (values: BookingFormValues) => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      const valuesWithOperation: BookingFormValues = {
        ...values,
        mode: bookingOperation,
      };

      const action =
        bookingOperation === "TRANSFER"
          ? onTransferAction
          : bookingOperation === "SWITCHING"
            ? onSwitchAction
            : (onSubmitAction ?? submitBookingDraftAction);

      if (!action) {
        showError("This action is not configured.");
        return;
      }

      const result = await action(valuesWithOperation);
      if (result.ok) {
        showSuccess(result.message);
        onSuccess?.();
        return;
      }
      showError(result.message);
      if (result.fieldErrors) {
        for (const [key, messages] of Object.entries(result.fieldErrors)) {
          const msg = messages?.[0];
          if (msg) {
            setError(key as keyof BookingFormInput, { type: "server", message: msg });
          }
        }
      }
    } catch {
      showError("Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };
  useEffect(() => {
    const valuesForDisplay: BookingFormInput = {
      ...defaultValues,
      income: defaultValues.income === undefined ? undefined : formatWithCommas(defaultValues.income),
      priceOfUnit: formatWithCommas(defaultValues.priceOfUnit ?? "0"),
      cashPayable: formatWithCommas(defaultValues.cashPayable ?? "0"),
      discountAmount: formatWithCommas(defaultValues.discountAmount ?? "0"),
      transferCharges: formatWithCommas(defaultValues.transferCharges ?? "0"),
      expectedLoan: defaultValues.expectedLoan === undefined ? undefined : formatWithCommas(defaultValues.expectedLoan),
      grossTotal: formatWithCommas(defaultValues.grossTotal ?? "0"),
      payableCost: formatWithCommas(defaultValues.payableCost ?? "0"),
    };
    reset(valuesForDisplay);
    const nextMode =
      defaultValues.mode === "TRANSFER"
        ? "TRANSFER"
        : defaultValues.mode === "SWITCHING"
          ? "SWITCHING"
          : "REGULAR";
    setBookingOperation(nextMode);
    setValue("mode", nextMode, { shouldValidate: false, shouldDirty: false });
    const tower = (defaultValues.tower ?? "").trim();
    const unitNo = (defaultValues.unitNo ?? "").trim();
    setUnitQuery(unitNo ? (tower ? `${tower}-${unitNo}` : unitNo) : "");
    setUnitResults([]);
    setApplicantLockedFromLookup(false);
    setNomineeLockedFromLookup(false);
    setCustomerLookupMessage("");
    setNomineeLookupMessage("");
    applicantLockIdentityRef.current = null;
    nomineeLockCnicDigitsRef.current = null;
    customerLookupCacheRef.current = {};
    nomineeLookupCacheRef.current = {};
  }, [defaultValues, reset, setValue]);


  const projectOptions = useMemo(
    () => projects.map((project) => ({ label: `${project.name} (${project.code})`, value: project.code })),
    [projects],
  );

  const clearSelectedUnit = useCallback(() => {
    setValue("unitNo", "", { shouldValidate: true, shouldDirty: true });
    setValue("tower", "", { shouldValidate: true, shouldDirty: true });
    setValue("floorNo", "", { shouldValidate: true, shouldDirty: true });
    setValue("category", "", { shouldValidate: true, shouldDirty: true });
    setValue("unitType", "RESIDENTIAL", { shouldValidate: true, shouldDirty: true });
    setValue("size", "", { shouldValidate: true, shouldDirty: true });
    setValue("rooms", "", { shouldValidate: true, shouldDirty: true });
    setValue("facing", "", { shouldValidate: true, shouldDirty: true });
    setValue("priceOfUnit", "0", { shouldValidate: true, shouldDirty: true });
    setValue("transferCharges", "0", { shouldValidate: true, shouldDirty: true });
    setValue("discountAmount", "0", { shouldValidate: true, shouldDirty: true });
    setValue("cashPayable", "0", { shouldValidate: true, shouldDirty: true });
    setValue("grossTotal", "0", { shouldValidate: true, shouldDirty: true });
    setValue("payableCost", "0", { shouldValidate: true, shouldDirty: true });
    setUnitQuery("");
    setUnitResults([]);
  }, [setValue]);

  const applyUnitSelection = (unit: UnitSearchResult) => {
    setShowUnitResults(false);
    setUnitResults([]);
    setUnitQuery(unit.displayLabel);
    setValue("projectCode", unit.projectCode, { shouldValidate: true, shouldDirty: true });
    setValue("unitNo", unit.unitNo, { shouldValidate: true, shouldDirty: true });
    setValue("tower", unit.towerCode, { shouldValidate: true, shouldDirty: true });
    setValue("floorNo", unit.floorNo === "" ? "" : String(unit.floorNo), { shouldValidate: true, shouldDirty: true });
    setValue("category", unit.category, { shouldValidate: true, shouldDirty: true });
    setValue("unitType", unit.unitType, { shouldValidate: true, shouldDirty: true });
    setValue("size", unit.size, { shouldValidate: true, shouldDirty: true });
    setValue("rooms", unit.rooms === "" ? "" : String(unit.rooms), { shouldValidate: true, shouldDirty: true });
    setValue("facing", unit.facing, { shouldValidate: true, shouldDirty: true });
    setValue("priceOfUnit", formatWithCommas(unit.basePrice), { shouldValidate: true, shouldDirty: true });
    setValue("transferCharges", formatWithCommas(unit.transferCharges), { shouldValidate: true, shouldDirty: true });
  };

  useEffect(() => {
    if (readOnly) return;
    const query = unitQuery.trim();
    if (!selectedProjectCode || query.length < 1) {
      setUnitResults([]);
      setIsUnitLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setIsUnitLoading(true);
        const params = new URLSearchParams({
          projectCode: selectedProjectCode,
          q: query,
        });
        if (unitSearchIncludeId?.trim()) {
          params.set("includeUnitId", unitSearchIncludeId.trim());
        }
        const response = await fetch(`/api/units/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Unable to search units");
        }
        const data = (await response.json()) as { items?: UnitSearchResult[] };
        setUnitResults(Array.isArray(data.items) ? data.items : []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setUnitResults([]);
      } finally {
        setIsUnitLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [readOnly, selectedProjectCode, unitQuery, unitSearchIncludeId]);

  useEffect(() => {
    if (readOnly) return;
    const { identityKey } = getApplicantIdentityFromFormValues(
      cnicValue,
      whatsappValue,
      phoneResValue,
      phoneOfficeValue,
    );
    if (applicantLockIdentityRef.current === null) return;
    if (identityKey !== applicantLockIdentityRef.current) {
      setApplicantLockedFromLookup(false);
      applicantLockIdentityRef.current = null;
    }
  }, [cnicValue, phoneOfficeValue, phoneResValue, readOnly, whatsappValue]);

  useEffect(() => {
    if (readOnly) return;
    const d = formatCnicInput(nomineeCnicValue).replace(/\D/g, "");
    if (nomineeLockCnicDigitsRef.current === null) return;
    if (d !== nomineeLockCnicDigitsRef.current) {
      setNomineeLockedFromLookup(false);
      nomineeLockCnicDigitsRef.current = null;
    }
  }, [nomineeCnicValue, readOnly]);

  useEffect(() => {
    if (!isTransferMode && parseFormattedNumber(transferCharges) !== 0) {
      setValue("transferCharges", "0", { shouldValidate: true, shouldDirty: true });
    }
  }, [isTransferMode, setValue, transferCharges]);

  useEffect(() => {
    setValue("grossTotal", formatWithCommas(grossTotalAmount.toFixed(2)), { shouldValidate: true, shouldDirty: true });
    setValue("payableCost", formatWithCommas(payableCostAmount.toFixed(2)), { shouldValidate: true, shouldDirty: true });
  }, [grossTotalAmount, payableCostAmount, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={compact ? "space-y-3 lg:space-y-4" : "space-y-4 lg:space-y-5"}>
      {!hideTopBar ? (
        <motion.div
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
        >
          <div>
            <h2 className="text-xl font-bold text-slate-900 md:text-2xl">New Booking</h2>
            <p className="text-sm text-slate-500">
              Validated fields, guided placeholders, and smooth motion — aligned with your legacy form workflow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary">
              Find Booking
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Validating…" : "Save Booking"}
            </Button>
          </div>
        </motion.div>
      ) : null}

      <motion.div {...sectionMotion} transition={{ type: "spring", stiffness: 320, damping: 28, delay: 0.02 }}>
        <Card animate={false} className="p-4 sm:p-5">
          <button
            type="button"
            onClick={() => toggleSection("booking")}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div>
              <h3 className="text-base font-semibold text-slate-900 md:text-lg">Booking setup</h3>
              <p className="text-xs text-slate-500">Date, serial number, mode, and switching/cancellation details.</p>
            </div>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", openSections.booking && "rotate-180")}
            />
          </button>
          <AnimatePresence initial={false}>
            {openSections.booking ? (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Field
                    id="bookingDate"
                    label="Date"
                    type="date"
                    hint="Official booking date on file"
                    placeholder="YYYY-MM-DD"
                    error={errors.bookingDate?.message}
                    readOnly={readOnly}
                    {...register("bookingDate")}
                  />
                  {showModeSelector ? (
                    <Controller
                      name="mode"
                      control={control}
                      render={({ field }) => (
                        <SelectField
                          id="mode"
                          label="Mode"
                          options={modeOptions}
                          hint="Regular, transfer, cancel, switching, or gift"
                          error={errors.mode?.message}
                          disabled={readOnly}
                          {...field}
                        />
                      )}
                    />
                  ) : (
                    <Controller
                      name="mode"
                      control={control}
                      render={({ field }) => <input type="hidden" {...field} />}
                    />
                  )}
                  {enableTransferSwitchActions && !readOnly ? (
                    <div className="sm:col-span-2 xl:col-span-2">
                      <p className="text-sm font-semibold text-slate-700">Edit action</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={bookingOperation === "REGULAR" ? "primary" : "secondary"}
                          onClick={() => activateOperation("REGULAR")}
                        >
                          Regular Update
                        </Button>
                        <Button
                          type="button"
                          variant={bookingOperation === "TRANSFER" ? "primary" : "secondary"}
                          onClick={() => activateOperation("TRANSFER")}
                        >
                          Transfer To
                        </Button>
                        <Button
                          type="button"
                          variant={bookingOperation === "SWITCHING" ? "primary" : "secondary"}
                          onClick={() => activateOperation("SWITCHING")}
                        >
                          Switch To
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <AnimatePresence mode="popLayout">
                    {showSwitchFields ? (
                      <motion.div
                        key="switch-unit"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="sm:col-span-2 xl:col-span-2"
                      >
                        <Field
                          id="switchToUnitNo"
                          label="Switch to unit #"
                          placeholder="e.g. A-1305 or SHOP-12"
                          hint="Required for transfer / switching"
                          error={errors.switchToUnitNo?.message}
                          readOnly={readOnly}
                          {...register("switchToUnitNo")}
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  <AnimatePresence mode="popLayout">
                    {showTransferDate ? (
                      <motion.div
                        key="transfer-date"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="sm:col-span-2 xl:col-span-2"
                      >
                        <Field
                          id="transferDate"
                          label="Transfer date"
                          type="date"
                          placeholder="YYYY-MM-DD"
                          error={errors.transferDate?.message}
                          readOnly={readOnly}
                          {...register("transferDate")}
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  <AnimatePresence mode="popLayout">
                    {showSwitchFields ? (
                      <motion.div
                        key="switching-date"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="sm:col-span-2 xl:col-span-2"
                      >
                        <Field
                          id="switchingDate"
                          label="Switch date"
                          type="date"
                          placeholder="YYYY-MM-DD"
                          error={errors.switchingDate?.message}
                          readOnly={readOnly}
                          {...register("switchingDate")}
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  <AnimatePresence mode="popLayout">
                    {showCancelDate ? (
                      <motion.div
                        key="cancel-date"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="sm:col-span-2 xl:col-span-2"
                      >
                        <Field
                          id="cancelDate"
                          label="Cancellation date"
                          type="date"
                          error={errors.cancelDate?.message}
                          readOnly={readOnly}
                          {...register("cancelDate")}
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Card>
      </motion.div>

      <motion.div {...sectionMotion} transition={{ type: "spring", stiffness: 320, damping: 28, delay: 0.06 }}>
        <Card animate={false} className="p-4 sm:p-5">
          <button type="button" onClick={() => toggleSection("unit")} className="flex w-full items-center justify-between gap-3 text-left">
            <h3 className="text-base font-semibold text-slate-900 md:text-lg">Unit information</h3>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", openSections.unit && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {openSections.unit ? (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Controller
                    name="projectCode"
                    control={control}
                    render={({ field }) => (
                      <SelectField
                        id="projectCode"
                        label="Project"
                        options={projectOptions}
                        hint="Select project first to narrow unit search"
                        error={errors.projectCode?.message}
                        disabled={readOnly}
                        {...field}
                        onChange={(event) => {
                          const previous = field.value;
                          field.onChange(event.target.value);
                          if (!readOnly && previous !== event.target.value) {
                            clearSelectedUnit();
                          }
                        }}
                      />
                    )}
                  />
                  <div className="relative sm:col-span-2 xl:col-span-3">
                    <Field
                      id="unitLookup"
                      label="Unit number"
                      placeholder={selectedProjectCode ? "Type unit number (e.g. 101, SF-101, SHOP-07)" : "Select project first"}
                      value={unitQuery}
                      onFocus={() => {
                        if (!readOnly) setShowUnitResults(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowUnitResults(false), 120);
                      }}
                      onChange={(event) => {
                        const next = event.target.value;
                        setUnitQuery(next);
                        if (!readOnly) setShowUnitResults(true);
                        if (next.trim().length === 0) {
                          clearSelectedUnit();
                        }
                      }}
                      readOnly={readOnly}
                      disabled={!selectedProjectCode || readOnly}
                      hint="Autocomplete runs on server with project-level filtering."
                      error={errors.unitNo?.message}
                    />
                    <input type="hidden" {...register("unitNo")} />
                    {showUnitResults && selectedProjectCode && !readOnly ? (
                      <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                        {isUnitLoading ? (
                          <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Searching units...
                          </div>
                        ) : unitResults.length > 0 ? (
                          unitResults.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                              onClick={() => applyUnitSelection(item)}
                            >
                              <span className="text-sm font-medium text-slate-800">{item.displayLabel}</span>
                              <span className="text-xs text-slate-500">{item.projectCode}</span>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-slate-500">No matching units found.</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <Field
                    id="tower"
                    label="Tower"
                    placeholder="Auto-filled from selected unit"
                    readOnly
                    className="bg-slate-50"
                    error={errors.tower?.message}
                    {...register("tower")}
                  />
                  <Field
                    id="floorNo"
                    label="Floor"
                    type="text"
                    inputMode="numeric"
                    placeholder="Auto-filled from selected unit"
                    readOnly
                    className="bg-slate-50"
                    error={errors.floorNo?.message as string | undefined}
                    {...register("floorNo")}
                  />
                  <Field
                    id="category"
                    label="Category"
                    placeholder="Auto-filled from selected unit"
                    readOnly
                    className="bg-slate-50"
                    error={errors.category?.message}
                    {...register("category")}
                  />
                  <Field
                    id="unitTypeReadonly"
                    label="Unit type"
                    value={unitTypeOptions.find((item) => item.value === unitTypeValue)?.label ?? unitTypeValue}
                    readOnly
                    className="bg-slate-50"
                  />
                  <Controller
                    name="unitType"
                    control={control}
                    render={({ field }) => <input type="hidden" {...field} />}
                  />
                  <Field
                    id="size"
                    label="Size (sq ft)"
                    type="text"
                    inputMode="decimal"
                    placeholder="Auto-filled from selected unit"
                    readOnly
                    className="bg-slate-50"
                    error={errors.size?.message as string | undefined}
                    {...register("size")}
                  />
                  <Field
                    id="rooms"
                    label="Rooms"
                    type="text"
                    inputMode="numeric"
                    placeholder="Auto-filled from selected unit"
                    readOnly
                    className="bg-slate-50"
                    error={errors.rooms?.message as string | undefined}
                    {...register("rooms")}
                  />
                  <Field
                    id="facing"
                    label="Facing"
                    placeholder="Auto-filled from selected unit"
                    readOnly
                    className="bg-slate-50"
                    error={errors.facing?.message}
                    {...register("facing")}
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Card>
      </motion.div>

      <motion.div {...sectionMotion} transition={{ type: "spring", stiffness: 320, damping: 28, delay: 0.1 }}>
        <Card animate={false} className="p-4 sm:p-5">
          <button type="button" onClick={() => toggleSection("applicant")} className="flex w-full items-center justify-between gap-3 text-left">
            <h3 className="text-base font-semibold text-slate-900 md:text-lg">Primary applicant</h3>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", openSections.applicant && "rotate-180")}
            />
          </button>
          <AnimatePresence initial={false}>
            {openSections.applicant ? (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <div>
              <Field
                id="cnic"
                label="CNIC"
                placeholder="12345-1234567-1"
                hint={
                  isCustomerLookupLoading
                    ? "Searching existing customer..."
                    : customerLookupMessage ||
                      "Enter CNIC or phone, then press Enter to load a saved customer (edit CNIC anytime to search again)"
                }
                inputMode="numeric"
                autoComplete="off"
                readOnly={readOnly}
                error={errors.cnic?.message}
                {...register("cnic", {
                  onChange: (event) => {
                    if (readOnly) return;
                    event.target.value = formatCnicInput(event.target.value);
                  },
                })}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  if (readOnly) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runCustomerLookup();
                  }
                }}
              />
              {isCustomerLookupLoading ? (
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading customer details...</span>
                </div>
              ) : null}
            </div>
            <Field
              id="fullName"
              label="Name"
              placeholder="Full legal name"
              error={errors.fullName?.message}
              readOnly={applicantOtherReadOnly}
              {...register("fullName")}
            />
            <Field
              id="fatherHusband"
              label="Father / husband"
              placeholder="Guardian or spouse name"
              error={errors.fatherHusband?.message}
              readOnly={applicantOtherReadOnly}
              {...register("fatherHusband")}
            />
            <div className="lg:col-span-2 xl:col-span-3">
              <TextareaField
                id="postalAddress"
                label="Postal address"
                placeholder="House #, street, city, postal code"
                hint="As it should appear on allotment / agreement"
                error={errors.postalAddress?.message}
                readOnly={applicantOtherReadOnly}
                {...register("postalAddress")}
              />
            </div>
            <Field
              id="phoneOffice"
              label="Phone office"
              placeholder="+92 21 1234567"
              error={errors.phoneOffice?.message}
              readOnly={readOnly}
              {...register("phoneOffice")}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (readOnly) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  void runCustomerLookup();
                }
              }}
            />
            <Field
              id="phoneRes"
              label="Phone res."
              placeholder="+92 300 1234567"
              error={errors.phoneRes?.message}
              readOnly={readOnly}
              {...register("phoneRes")}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (readOnly) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  void runCustomerLookup();
                }
              }}
            />
            <Field
              id="whatsapp"
              label="WhatsApp"
              placeholder="+92 300 1234567"
              error={errors.whatsapp?.message}
              readOnly={readOnly}
              {...register("whatsapp")}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (readOnly) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  void runCustomerLookup();
                }
              }}
            />
            <Field
              id="email"
              label="Email"
              type="email"
              placeholder="name@example.com"
              error={errors.email?.message}
              readOnly={applicantOtherReadOnly}
              {...register("email")}
            />
            <Field
              id="income"
              label="Income"
              type="text"
              inputMode="decimal"
              placeholder="Monthly / annual — numeric"
              error={errors.income?.message as string | undefined}
              readOnly={applicantOtherReadOnly}
              {...register("income", {
                onChange: (event) => {
                  if (readOnly || applicantLockedFromLookup) return;
                  event.target.value = formatWithCommas(event.target.value);
                },
              })}
            />
            <Field
              id="age"
              label="Age"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 35"
              error={errors.age?.message as string | undefined}
              readOnly={applicantOtherReadOnly}
              {...register("age")}
            />
            <Field
              id="nationality"
              label="Nationality"
              placeholder="e.g. PAKISTANI"
              error={errors.nationality?.message}
              readOnly={applicantOtherReadOnly}
              {...register("nationality")}
            />
            <Field
              id="passportNo"
              label="Passport"
              placeholder="AB1234567"
              error={errors.passportNo?.message}
              readOnly={applicantOtherReadOnly}
              {...register("passportNo")}
            />
            <Field
              id="occupation"
              label="Occupation"
              placeholder="Job title / business"
              error={errors.occupation?.message}
              readOnly={applicantOtherReadOnly}
              {...register("occupation")}
            />
            <Field
              id="broker"
              label="Broker"
              placeholder="Agent or channel partner"
              error={errors.broker?.message}
              readOnly={applicantOtherReadOnly}
              {...register("broker")}
            />
            <Field
              id="careOf"
              label="Care of"
              placeholder="Optional care-of line"
              error={errors.careOf?.message}
              readOnly={applicantOtherReadOnly}
              {...register("careOf")}
            />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Card>
      </motion.div>

      <motion.div {...sectionMotion} transition={{ type: "spring", stiffness: 320, damping: 28, delay: 0.14 }}>
        <Card animate={false} className="p-4 sm:p-5">
          <button type="button" onClick={() => toggleSection("nominee")} className="flex w-full items-center justify-between gap-3 text-left">
            <div>
              <h3 className="text-base font-semibold text-slate-900 md:text-lg">Nominee detail</h3>
              <p className="text-xs text-slate-500">Optional block — nominee name is required once nominee data is entered.</p>
            </div>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", openSections.nominee && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {openSections.nominee ? (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <div>
              <Field
                id="nomineeCnic"
                label="CNIC"
                placeholder="12345-1234567-1"
                hint={
                  isNomineeLookupLoading
                    ? "Searching saved nominees..."
                    : nomineeLookupMessage ||
                      "Enter nominee CNIC, then press Enter to load saved nominee details"
                }
                inputMode="numeric"
                autoComplete="off"
                readOnly={readOnly}
                error={errors.nomineeCnic?.message}
                {...register("nomineeCnic", {
                  onChange: (event) => {
                    if (readOnly) return;
                    event.target.value = formatCnicInput(event.target.value);
                  },
                })}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  if (readOnly) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runNomineeLookup();
                  }
                }}
              />
              {isNomineeLookupLoading ? (
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading nominee details...</span>
                </div>
              ) : null}
            </div>
            <Field
              id="nomineeName"
              label="Nominee name"
              placeholder="Full name"
              error={errors.nomineeName?.message}
              readOnly={nomineeOtherReadOnly}
              {...register("nomineeName")}
            />
            <Field
              id="relation"
              label="Relation"
              placeholder="e.g. Brother, Son"
              error={errors.relation?.message}
              readOnly={nomineeOtherReadOnly}
              {...register("relation")}
            />
            <Field
              id="nomineeFatherName"
              label="Father name"
              placeholder="Father / guardian"
              error={errors.nomineeFatherName?.message}
              readOnly={nomineeOtherReadOnly}
              {...register("nomineeFatherName")}
            />
            <div className="lg:col-span-2 xl:col-span-3">
              <TextareaField
                id="nomineeAddress"
                label="Address"
                placeholder="Nominee mailing address"
                error={errors.nomineeAddress?.message}
                readOnly={nomineeOtherReadOnly}
                {...register("nomineeAddress")}
              />
            </div>
            <Field
              id="nomineePassport"
              label="Passport"
              placeholder="AB1234567"
              error={errors.nomineePassport?.message}
              readOnly={nomineeOtherReadOnly}
              {...register("nomineePassport")}
            />
            <Field
              id="nomineeCell"
              label="Cell"
              placeholder="+92 300 1234567"
              error={errors.nomineeCell?.message}
              readOnly={nomineeOtherReadOnly}
              {...register("nomineeCell")}
            />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Card>
      </motion.div>

      <motion.div {...sectionMotion} transition={{ type: "spring", stiffness: 320, damping: 28, delay: 0.18 }}>
        <Card animate={false} className="p-4 sm:p-5">
          <button type="button" onClick={() => toggleSection("finance")} className="flex w-full items-center justify-between gap-3 text-left">
            <h3 className="text-base font-semibold text-slate-900 md:text-lg">Office financial block</h3>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", openSections.finance && "rotate-180")}
            />
          </button>
          <AnimatePresence initial={false}>
            {openSections.finance ? (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,1fr)]">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      id="priceOfUnit"
                      label="Unit price (base)"
                      type="text"
                      inputMode="decimal"
                      placeholder="Auto-fetched from selected unit"
                      readOnly
                      className="bg-slate-50"
                      error={errors.priceOfUnit?.message as string | undefined}
                      {...register("priceOfUnit")}
                    />
                    <Field
                      id="transferCharges"
                      label="Transfer charges (+)"
                      type="text"
                      inputMode="decimal"
                      placeholder={isTransferMode ? "Auto-fetched for transfer mode" : "Only applies in transfer mode"}
                      readOnly
                      className="bg-slate-50"
                      error={errors.transferCharges?.message as string | undefined}
                      {...register("transferCharges")}
                    />
                    <Field
                      id="discountAmount"
                      label="Discount (-)"
                      type="text"
                      inputMode="decimal"
                      placeholder="If any — numeric"
                      error={errors.discountAmount?.message as string | undefined}
                      readOnly={readOnly}
                      {...register("discountAmount", {
                        onChange: (event) => {
                          if (readOnly) return;
                          event.target.value = formatWithCommas(event.target.value);
                        },
                      })}
                    />
                    <Field
                      id="cashPayable"
                      label="Cash payable (+)"
                      type="text"
                      inputMode="decimal"
                      placeholder="Office cash component to add in payable"
                      error={errors.cashPayable?.message as string | undefined}
                      readOnly={readOnly}
                      {...register("cashPayable", {
                        onChange: (event) => {
                          if (readOnly) return;
                          event.target.value = formatWithCommas(event.target.value);
                        },
                      })}
                    />
                    <Field
                      id="expectedLoan"
                      label="Expected loan"
                      type="text"
                      inputMode="decimal"
                      placeholder="Bank finance portion"
                      error={errors.expectedLoan?.message as string | undefined}
                      readOnly={readOnly}
                      {...register("expectedLoan", {
                        onChange: (event) => {
                          if (readOnly) return;
                          event.target.value = formatWithCommas(event.target.value);
                        },
                      })}
                    />
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <p className="font-semibold text-slate-800">Invoice logic</p>
                      <p className="mt-1">Gross Total = Unit Price + Transfer Charges - Discount</p>
                      <p className="mt-1">Payable Cost = Gross Total + Cash Payable</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice Summary</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-600">Unit price</span>
                        <span className="font-medium text-slate-900">{formatWithCommas(unitPriceAmount.toFixed(2))}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-600">+ Transfer charges</span>
                        <span className="font-medium text-slate-900">{formatWithCommas(transferAmount.toFixed(2))}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-600">- Discount</span>
                        <span className="font-medium text-slate-900">{formatWithCommas(discountAmountValue.toFixed(2))}</span>
                      </div>
                      <div className="my-1 border-t border-dashed border-slate-300" />
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-slate-800">Gross total</span>
                        <span className="font-semibold text-slate-900">{formatWithCommas(grossTotalAmount.toFixed(2))}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-600">+ Cash payable</span>
                        <span className="font-medium text-slate-900">{formatWithCommas(cashPayableAmount.toFixed(2))}</span>
                      </div>
                      <div className="my-1 border-t border-slate-300" />
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-brand-50 px-3 py-2">
                        <span className="font-semibold text-brand-800">Payable cost</span>
                        <span className="text-lg font-bold text-brand-900">{formatWithCommas(payableCostAmount.toFixed(2))}</span>
                      </div>
                    </div>
                    <input type="hidden" {...register("grossTotal")} />
                    <input type="hidden" {...register("payableCost")} />
                    {errors.grossTotal?.message ? (
                      <p className="mt-2 text-xs text-red-600">{errors.grossTotal.message as string}</p>
                    ) : null}
                    {errors.payableCost?.message ? (
                      <p className="mt-2 text-xs text-red-600">{errors.payableCost.message as string}</p>
                    ) : null}
                  </div>
                </div>
                {hideTopBar && !readOnly ? (
                  <div className="mt-4 flex justify-end">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? "Saving..." : submitLabel}
                    </Button>
                  </div>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Card>
      </motion.div>
    </form>
  );
}
