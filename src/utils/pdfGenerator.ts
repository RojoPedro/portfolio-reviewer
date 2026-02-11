import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReviewData {
    review_metadata: {
        severity_applied: number;
        date: string;
    };
    scores: {
        final_score: number;
        categories: {
            hard_skills: number;
            experience_relevance: number;
            impact_results: number;
            soft_skills: number;
            formatting_ats: number;
        };
    };
    feedback_cards: Array<{
        category_name: string;
        score: number;
        short_comment: string;
        status_color: string;
    }>;
    actionable_feedback: string[];
}

export const generateReviewPDF = (data: ReviewData, cvUrl: string | null, jobUrl: string | null) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // --- Header ---
    doc.setFontSize(22);
    doc.setTextColor(220, 38, 38); // Red-600
    doc.text("Portfolio Review Report", 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date(data.review_metadata.date).toLocaleString()}`, 14, 28);
    doc.text(`Severity Level: ${data.review_metadata.severity_applied}/10`, 14, 33);

    // --- Score Summary ---
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(`Final Score: ${data.scores.final_score}/100`, 14, 45);

    const headers = [["Category", "Score", "Feedback"]];
    const rows = data.feedback_cards.map(card => [
        card.category_name,
        `${card.score}/100`,
        card.short_comment
    ]);

    autoTable(doc, {
        startY: 50,
        head: headers,
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38] },
        columnStyles: {
            0: { cellWidth: 40 },
            1: { cellWidth: 20 },
            2: { cellWidth: 'auto' }
        }
    });

    // --- Actionable Feedback ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalY = (doc as any).lastAutoTable.finalY + 15;

    doc.setFontSize(14);
    doc.setTextColor(220, 38, 38);
    doc.text("Top 3 Actionable Steps", 14, finalY);

    doc.setFontSize(11);
    doc.setTextColor(0);
    finalY += 8;

    data.actionable_feedback.forEach((action, index) => {
        const splitText = doc.splitTextToSize(`${index + 1}. ${action}`, pageWidth - 28);
        doc.text(splitText, 14, finalY);
        finalY += (splitText.length * 5) + 3;
    });

    // --- Audit Links ---
    finalY += 10;
    doc.setDrawColor(200);
    doc.line(14, finalY, pageWidth - 14, finalY);
    finalY += 10;

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Audit Links for Reference:", 14, finalY);
    finalY += 6;

    if (cvUrl) {
        doc.setTextColor(0, 0, 255);
        doc.textWithLink("View Reviewed CV/Portfolio", 14, finalY, { url: cvUrl });
        finalY += 6;
    }

    if (jobUrl) {
        doc.setTextColor(0, 0, 255);
        doc.textWithLink("View Job Offer / Description", 14, finalY, { url: jobUrl });
    }

    // Save the PDF
    doc.save(`Portfolio_Review_${new Date().toISOString().split('T')[0]}.pdf`);
};
