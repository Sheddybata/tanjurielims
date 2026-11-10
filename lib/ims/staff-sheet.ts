import { jsPDF } from "jspdf";

type SheetDepartment = {
  name?: string | null;
  subsidiaries?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

export type StaffSheetPerson = {
  full_name: string;
  job_title?: string | null;
  status?: string | null;
  departments?: SheetDepartment | Array<SheetDepartment> | null;
};

function departmentOf(person: StaffSheetPerson) {
  return Array.isArray(person.departments) ? person.departments[0] : person.departments;
}

function subsidiaryName(person: StaffSheetPerson) {
  const department = departmentOf(person);
  const nested = Array.isArray(department?.subsidiaries) ? department?.subsidiaries[0] : department?.subsidiaries;
  return nested?.name || "—";
}

function departmentName(person: StaffSheetPerson) {
  return departmentOf(person)?.name || "—";
}

const COLUMNS = [
  { title: "No.", width: 10 },
  { title: "Name", width: 40 },
  { title: "Job title", width: 36 },
  { title: "Department", width: 36 },
  { title: "Subsidiary", width: 82 },
  { title: "Salary on appointment letter", width: 42 },
  { title: "Salary received", width: 35 }
];

export async function downloadStaffSheet(people: StaffSheetPerson[]) {
  const rows = [...people].sort((a, b) => {
    const subsidiary = subsidiaryName(a).localeCompare(subsidiaryName(b));
    if (subsidiary) return subsidiary;
    const department = departmentName(a).localeCompare(departmentName(b));
    if (department) return department;
    return a.full_name.localeCompare(b.full_name);
  });
  if (!rows.length) throw new Error("There are no staff on the register to export.");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8;
  const lineHeight = 3.6;
  let y = margin;

  function wrapped(text: string, width: number) {
    return doc.splitTextToSize(text || "—", Math.max(width - 3, 8)) as string[];
  }

  function blockHeight(lines: string[][]) {
    const count = Math.max(1, ...lines.map((item) => item.length));
    return Math.max(8, count * lineHeight + 2.4);
  }

  function drawTitle() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 64, 175);
    doc.text("TANJURIEL", margin, y + 4);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.text("Staff list", margin, y + 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const printed = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    doc.text(`Printed ${printed}  ·  ${rows.length} staff`, margin, y + 16);
    y += 22;
  }

  function drawHeader() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const headerLines = COLUMNS.map((column) => wrapped(column.title, column.width));
    const height = blockHeight(headerLines);
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, y, pageWidth - margin * 2, height, "F");
    doc.setTextColor(255, 255, 255);
    let x = margin;
    headerLines.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => {
        doc.text(line, x + 1.5, y + 4 + lineIndex * lineHeight);
      });
      x += COLUMNS[index].width;
    });
    y += height;
  }

  function newPage() {
    doc.addPage();
    y = margin;
    drawHeader();
  }

  drawTitle();
  drawHeader();

  rows.forEach((person, index) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const values = [
      String(index + 1),
      person.full_name,
      person.job_title || "—",
      departmentName(person),
      subsidiaryName(person),
      " ",
      " "
    ];
    const lines = values.map((value, columnIndex) => (value.trim() ? wrapped(value, COLUMNS[columnIndex].width) : [""]));
    const height = blockHeight(lines);
    if (y + height > pageHeight - margin) newPage();
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageWidth - margin * 2, height, "F");
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, pageWidth - margin * 2, height);
    doc.setTextColor(15, 23, 42);
    let x = margin;
    lines.forEach((cell, columnIndex) => {
      cell.forEach((line, lineIndex) => {
        if (line) doc.text(line, x + 1.5, y + 4.2 + lineIndex * lineHeight);
      });
      x += COLUMNS[columnIndex].width;
    });
    y += height;
  });

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`Tanjuriel-staff-list-${stamp}.pdf`);
}
