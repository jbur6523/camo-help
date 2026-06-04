import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ApplicationData } from "@/lib/types";
import { fullName } from "@/lib/types";
import type { AthleteOverflowPlan, OverflowSection } from "@/lib/pdf/pdfFieldNameMap";
import { fightSummary } from "@/lib/pdf/pdfFieldNameMap";

type Section = {
  key: OverflowSection;
  title: string;
  headers: string[];
  rows: string[][];
};

export async function generateContinuationSheets(data: ApplicationData, overflow: AthleteOverflowPlan) {
  const sections = continuationSections(data, overflow).filter((section) => section.rows.length > 0);
  if (!sections.length) return undefined;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 42;
  const pageWidth = 612;
  const pageHeight = 792;
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  let pageNumber = 1;

  const newPage = () => {
    drawFooter(page, font, pageNumber);
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    pageNumber += 1;
    drawHeader();
  };

  const ensureSpace = (height: number) => {
    if (y - height < margin + 26) newPage();
  };

  const drawHeader = () => {
    page.drawText("CAMO Athlete License Continuation Sheet", { x: margin, y, size: 16, font: bold, color: rgb(0.05, 0.07, 0.08) });
    y -= 24;
    page.drawText(`Applicant: ${fullName(data)}   DOB: ${data.birthDate}`, { x: margin, y, size: 10, font });
    y -= 18;
    page.drawText("This continuation sheet corresponds to the CAMO Athlete License Application fields that did not fit on the official form.", {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.25, 0.29, 0.31)
    });
    y -= 28;
  };

  drawHeader();

  for (const section of sections) {
    ensureSpace(54);
    page.drawText(section.title, { x: margin, y, size: 12, font: bold, color: rgb(0.05, 0.07, 0.08) });
    y -= 18;
    page.drawText(section.headers.join(" | "), { x: margin, y, size: 8, font: bold, color: rgb(0.10, 0.39, 0.31) });
    y -= 14;
    for (const row of section.rows) {
      const lines = wrap(row.join(" | "), 114);
      ensureSpace(lines.length * 11 + 8);
      lines.forEach((line) => {
        page.drawText(line, { x: margin, y, size: 8, font });
        y -= 11;
      });
      y -= 5;
    }
    y -= 14;
  }

  drawFooter(page, font, pageNumber);
  return pdfDoc.save();
}

function continuationSections(data: ApplicationData, overflow: AthleteOverflowPlan): Section[] {
  return [
    {
      key: "fights",
      title: "Verifiable Amateur Fight History",
      headers: ["Fight #", "Promoter", "State", "Opponent", "Outcome", "Date"],
      rows: data.fights.slice(finiteStart(overflow.fightStartIndex)).map((fight, index) => [
        String(finiteStart(overflow.fightStartIndex) + index + 1),
        fight.promoter,
        fight.state,
        fight.opponent,
        fight.outcome,
        fight.date || fightSummary(fight)
      ])
    },
    {
      key: "priorLicenses",
      title: "Prior Licenses",
      headers: ["#", "Type", "Year", "Authority"],
      rows: data.priorLicenses.slice(finiteStart(overflow.priorLicenseStartIndex)).map((entry, index) => [
        String(finiteStart(overflow.priorLicenseStartIndex) + index + 1),
        entry.licenseType,
        entry.licenseYear,
        entry.authority
      ])
    },
    {
      key: "discipline",
      title: "Discipline Entries",
      headers: ["#", "License Type", "Action", "Reason", "Date"],
      rows: data.commissionActions.slice(finiteStart(overflow.disciplineStartIndex)).map((entry, index) => [
        String(finiteStart(overflow.disciplineStartIndex) + index + 1),
        entry.licenseType,
        entry.actionTaken,
        entry.reason,
        entry.date
      ])
    },
    {
      key: "commissionCharges",
      title: "Pending Commission Charges",
      headers: ["#", "Offense", "Date", "Authority", "Hearing"],
      rows: data.commissionCharges.slice(finiteStart(overflow.commissionChargeStartIndex)).map((entry, index) => [
        String(finiteStart(overflow.commissionChargeStartIndex) + index + 1),
        entry.offense,
        entry.offenseDate,
        entry.authority,
        entry.hearingDate
      ])
    },
    {
      key: "convictions",
      title: "Criminal Convictions",
      headers: ["#", "Offense", "Conviction Date", "Location", "Sentence"],
      rows: data.convictions.slice(finiteStart(overflow.convictionStartIndex)).map((entry, index) => [
        String(finiteStart(overflow.convictionStartIndex) + index + 1),
        entry.offense,
        entry.convictionDate,
        entry.location,
        entry.sentence
      ])
    },
    {
      key: "pendingLawCharges",
      title: "Pending Law Enforcement Charges",
      headers: ["#", "Offense", "Date", "Location", "Hearing/Trial"],
      rows: data.pendingLawChargesList.slice(finiteStart(overflow.pendingLawChargeStartIndex)).map((entry, index) => [
        String(finiteStart(overflow.pendingLawChargeStartIndex) + index + 1),
        entry.offense,
        entry.offenseDate,
        entry.location,
        entry.hearingDate
      ])
    }
  ];
}

function finiteStart(value: number) {
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function wrap(text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawFooter(page: ReturnType<PDFDocument["addPage"]>, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, pageNumber: number) {
  page.drawText(`Continuation Sheet Page ${pageNumber}`, { x: 42, y: 26, size: 8, font, color: rgb(0.35, 0.39, 0.41) });
}
