"use client";

import Image from "next/image";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  APPLY_BIOMETRIC_METHODS,
  APPLY_EMPLOYMENT_STATUSES,
  APPLY_EMPLOYMENT_TYPES,
  APPLY_ID_TYPES,
  APPLY_IMS_ROLES
} from "@/lib/ims/apply";
import { SubsidiaryDepartmentFields, type OrgDepartment } from "@/app/components/org-select";

type DeptOption = OrgDepartment;

export default function StaffApplyPage() {
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [subsidiaryId, setSubsidiaryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ reference: string; message: string } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [uploadKey, setUploadKey] = useState(0);

  useEffect(() => {
    fetch("/api/apply/options")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load departments");
        setDepartments(payload.departments ?? []);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load form options"));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const body = new FormData(form);
    body.set("subsidiaryId", subsidiaryId);
    body.set("departmentId", departmentId);
    body.set("biometricConsent", (form.elements.namedItem("biometricConsent") as HTMLInputElement)?.checked ? "true" : "false");
    body.set("loginUnderstood", (form.elements.namedItem("loginUnderstood") as HTMLInputElement)?.checked ? "true" : "false");

    try {
      const response = await fetch("/api/apply", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Submission failed");
      setDone({
        reference: payload.application.reference_code,
        message: payload.message
      });
      form.reset();
      setSubsidiaryId("");
      setDepartmentId("");
      setUploadKey((value) => value + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_45%,#f8fafc_100%)]">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Image src="/tanjuriel-logo.jpg" alt="Tanjuriel Corporation" width={56} height={56} className="rounded-xl" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-800">Tanjuriel Corporation</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Staff details form</h1>
              <p className="mt-1 text-sm text-slate-600">ims.tanjuriel.com/apply · no login required</p>
            </div>
          </div>
        </header>

        {done ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-emerald-900">
            <p className="text-sm font-semibold uppercase tracking-[0.16em]">Submitted</p>
            <p className="mt-2 text-lg font-semibold">Reference: {done.reference}</p>
            <p className="mt-2 text-sm leading-6">{done.message}</p>
            <button type="button" className="secondary-button mt-4" onClick={() => setDone(null)}>
              Submit another person
            </button>
          </div>
        ) : (
          <>
            <p className="mb-6 max-w-3xl text-sm leading-6 text-slate-600">
              Complete this form so Central HR and the Director of Administration can verify your record. Your Staff ID is
              generated after review. Biometrics are enrolled later on an approved device — this form only records consent and readiness.
            </p>

            {loadError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}
            {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <form onSubmit={onSubmit} className="space-y-8" encType="multipart/form-data">
              <Section title="A. Identity" subtitle="Legal identity and emergency contacts.">
                <Field label="Full legal name" name="fullName" required />
                <Field label="Preferred name" name="preferredName" />
                <Select label="Gender" name="sex" required options={[["Female", "Female"], ["Male", "Male"], ["Other", "Other"]]} />
                <Field label="Date of birth" name="dateOfBirth" type="date" required />
                <Field label="Nationality" name="nationality" defaultValue="Nigerian" required />
                <Field label="Phone (primary)" name="phone" required />
                <Field label="Personal email" name="personalEmail" type="email" required />
                <Field label="Official work email (if any)" name="workEmail" type="email" />
                <Field label="Residential address" name="homeAddress" required className="md:col-span-2" />
                <Field label="Next of kin name" name="nextOfKinName" required />
                <Field label="Next of kin phone" name="nextOfKinPhone" required />
              </Section>

              <Section title="B. Employment placement" subtitle="Where you serve in Tanjuriel today.">
                <Select
                  label="Staff type"
                  name="staffType"
                  required
                  options={[
                    ["existing", "Existing staff"],
                    ["new", "New staff / onboarding"]
                  ]}
                />
                <Select label="Employment type" name="employmentType" required options={[...APPLY_EMPLOYMENT_TYPES]} />
                <Select label="Employment status" name="employmentStatus" required options={[...APPLY_EMPLOYMENT_STATUSES]} />
                <Field label="Date joined" name="startDate" type="date" required />
                <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
                  <SubsidiaryDepartmentFields
                    departments={departments}
                    subsidiaryId={subsidiaryId}
                    departmentId={departmentId}
                    onSubsidiaryId={setSubsidiaryId}
                    onDepartmentId={setDepartmentId}
                  />
                </div>
                <Field label="Job title" name="jobTitle" required />
                <Select label="Proposed IMS role" name="proposedImsRole" required options={[...APPLY_IMS_ROLES]} />
                <Field label="Reports to (supervisor name)" name="reportsToName" />
                <Field label="Work location / duty post" name="workLocation" />
                <Field label="Annual leave days (10–20 unpaid)" name="annualLeaveDays" type="number" defaultValue="10" required />
              </Section>

              <Section title="C. Official IDs" subtitle="Used for verification. Handle carefully.">
                <Select label="Means of ID type" name="governmentIdType" required options={[...APPLY_ID_TYPES]} />
                <Field label="NIN" name="nin" />
                <Field label="BVN (optional)" name="bvn" />
                <Field label="Bank name (optional)" name="bankName" />
                <Field label="Bank account (optional)" name="bankAccount" />
                <Field label="Highest qualification (optional)" name="highestQualification" />
                <Field label="Blood group (optional)" name="bloodGroup" />
              </Section>

              <Section title="D. Login readiness" subtitle="Account creation happens after HR/Admin review.">
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 md:col-span-2">
                  <input type="checkbox" name="loginUnderstood" className="mt-1" required />
                  <span>
                    I understand that HR or the Director of Administration will issue my IMS login password after this record is verified. I will not choose a password on this form.
                  </span>
                </label>
              </Section>

              <Section title="E. Biometric readiness" subtitle="No fingerprints or face templates are collected here.">
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 md:col-span-2">
                  <input type="checkbox" name="biometricConsent" className="mt-1" required />
                  <span>I consent to biometric enrollment later on an approved Tanjuriel device, linked to my Staff ID.</span>
                </label>
                <Select label="Preferred biometric method" name="biometricMethod" required options={[...APPLY_BIOMETRIC_METHODS]} />
                <Select
                  label="Hands/face usable for capture?"
                  name="biometricReady"
                  required
                  options={[
                    ["yes", "Yes"],
                    ["no", "No"]
                  ]}
                />
                <Field label="Enrollment note / preference (optional)" name="biometricNote" className="md:col-span-2" />
              </Section>

              <Section title="F. Uploads" subtitle="Take a photo with your camera or upload a file. Passport photo is required. ID document is optional. Max 5MB each.">
                <CameraOrUploadField
                  key={`photograph-${uploadKey}`}
                  label="Passport photograph"
                  name="photograph"
                  required
                  defaultFacingMode="user"
                  hint="Start with the front camera for a clear face photo. You can switch to back camera anytime."
                />
                <CameraOrUploadField
                  key={`idDocument-${uploadKey}`}
                  label="ID document (optional)"
                  name="idDocument"
                  defaultFacingMode="environment"
                  acceptUpload="image/*,.pdf"
                  hint="Optional. Start with the back camera for your ID, or switch to front. You can also upload a scan."
                />
                <FileField key={`cv-${uploadKey}`} label="CV (optional)" name="cv" accept=".pdf,.doc,.docx,image/*" />
              </Section>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">Staff ID is system-generated after HR or Director of Administration review.</p>
                <button type="submit" disabled={busy || Boolean(loadError)} className="primary-button disabled:opacity-60">
                  {busy ? "Submitting..." : "Submit staff details"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm sm:p-6">
      <div className="mb-4 border-b border-slate-100 pb-3">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  className
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="field-label">{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue} className="form-control" />
    </label>
  );
}

function Select({
  label,
  name,
  options,
  required
}: {
  label: string;
  name: string;
  options: ReadonlyArray<readonly [string, string]>;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select name={name} required={required} className="form-control" defaultValue="">
        <option value="" disabled>
          Select
        </option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function FileField({
  label,
  name,
  accept,
  required
}: {
  label: string;
  name: string;
  accept?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input name={name} type="file" accept={accept} required={required} className="form-control" />
    </label>
  );
}

function setInputFile(input: HTMLInputElement | null, file: File | null) {
  if (!input) return;
  const transfer = new DataTransfer();
  if (file) transfer.items.add(file);
  input.files = transfer.files;
}

function CameraOrUploadField({
  label,
  name,
  required,
  defaultFacingMode,
  acceptUpload = "image/*",
  hint
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultFacingMode: "user" | "environment";
  acceptUpload?: string;
  hint?: string;
}) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [starting, setStarting] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(defaultFacingMode);

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function stopCamera() {
    releaseStream();
    setCameraOpen(false);
    setStarting(false);
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function assignFile(file: File) {
    setInputFile(fileInputRef.current, file);
    setFileName(file.name);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
    setCameraError("");
  }

  async function startStream(nextFacing: "user" | "environment") {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera is not available in this browser. Use Upload instead.");
      fileInputRef.current?.click();
      return;
    }

    setStarting(true);
    setCameraOpen(true);
    releaseStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setFacingMode(nextFacing);
    } catch {
      stopCamera();
      setCameraError("Could not open the camera. Allow camera access, or use Upload.");
    } finally {
      setStarting(false);
    }
  }

  async function openCamera() {
    await startStream(facingMode);
  }

  async function switchCamera(nextFacing: "user" | "environment") {
    if (nextFacing === facingMode && cameraOpen && !starting) return;
    await startStream(nextFacing);
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setCameraError("Camera is still starting. Wait a moment, then try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Could not capture this frame.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setCameraError("Could not save the photo.");
      return;
    }

    const file = new File([blob], `${name}-${Date.now()}.jpg`, { type: "image/jpeg" });
    assignFile(file);
    stopCamera();
  }

  function clearFile() {
    setInputFile(fileInputRef.current, null);
    setFileName("");
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  return (
    <div className="block space-y-3 md:col-span-1">
      <div>
        <span className="field-label">{label}</span>
        {hint && <p className="mb-2 text-xs leading-5 text-slate-500">{hint}</p>}
      </div>

      <input
        ref={fileInputRef}
        id={inputId}
        name={name}
        type="file"
        accept={acceptUpload}
        required={required}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            clearFile();
            return;
          }
          assignFile(file);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" className="primary-button" onClick={openCamera} disabled={starting}>
          {starting ? "Opening camera..." : "Take photo"}
        </button>
        <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
          Upload file
        </button>
        {fileName && (
          <button type="button" className="secondary-button" onClick={clearFile}>
            Clear
          </button>
        )}
      </div>

      {cameraError && <p className="text-sm text-red-700">{cameraError}</p>}
      {fileName && <p className="text-sm text-slate-600">Selected: {fileName}</p>}

      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={`${label} preview`} className="h-40 w-full rounded-2xl border border-slate-200 object-cover" />
      )}

      {cameraOpen && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-950 p-3 text-white">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={starting}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                facingMode === "user" ? "bg-white text-slate-950" : "bg-white/15 text-white hover:bg-white/25"
              }`}
              onClick={() => switchCamera("user")}
            >
              Front camera
            </button>
            <button
              type="button"
              disabled={starting}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                facingMode === "environment" ? "bg-white text-slate-950" : "bg-white/15 text-white hover:bg-white/25"
              }`}
              onClick={() => switchCamera("environment")}
            >
              Back camera
            </button>
          </div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-56 w-full rounded-xl bg-black object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="primary-button" onClick={capturePhoto} disabled={starting}>
              Capture
            </button>
            <button type="button" className="secondary-button" onClick={stopCamera}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
