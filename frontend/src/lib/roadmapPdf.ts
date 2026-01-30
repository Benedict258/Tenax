import React from "react";
import { jsPDF } from "jspdf";

export function generateRoadmapPdf({
  title,
  goal,
  duration,
  phases,
}: {
  title: string;
  goal: string;
  duration: string;
  phases: Array<{
    title: string;
    aim?: string | null;
    description?: string | null;
    learn?: string[];
    deliverables?: string[];
    resources?: Array<{ title: string; url: string }>;
  }>;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const accent = "#F97316";
  let y = margin;

  const addTitle = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(17, 24, 39);
    doc.text(text, margin, y);
    y += 28;
  };

  const addSubtitle = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text(text, margin, y);
    y += 18;
  };

  const addSection = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(text, margin, y);
    y += 18;
  };

  const addBody = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(55, 65, 81);
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 16;
  };

  const addBulletList = (items: string[]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    items.forEach((item) => {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.circle(margin + 2, y - 3, 1, "F");
      doc.text(item, margin + 10, y);
      y += 14;
    });
  };

  const addDivider = () => {
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;
  };

  addTitle(title || "Resolution Roadmap");
  addSubtitle(goal);
  addSubtitle(duration);
  addDivider();

  phases.forEach((phase, index) => {
    if (y > pageHeight - margin - 120) {
      doc.addPage();
      y = margin;
    }
    doc.setFillColor(255, 247, 237);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 24, 6, 6, "F");
    doc.setTextColor(249, 115, 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Phase ${index + 1}`, margin + 10, y + 16);
    y += 34;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text(phase.title, margin, y);
    y += 18;

    if (phase.aim) {
      doc.setTextColor(249, 115, 22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(phase.aim, margin, y);
      y += 14;
    }

    if (phase.description) {
      addBody(phase.description);
    }

    if (phase.learn?.length) {
      addSection("What to learn");
      addBulletList(phase.learn);
    }
    if (phase.deliverables?.length) {
      addSection("Deliverables");
      addBulletList(phase.deliverables);
    }

    if (phase.resources?.length) {
      addSection("Resources");
      doc.setTextColor(37, 99, 235);
      doc.setFontSize(10);
      phase.resources.forEach((resource) => {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.textWithLink(resource.title, margin, y, { url: resource.url });
        y += 14;
      });
    }

    addDivider();
  });

  return doc;
}
