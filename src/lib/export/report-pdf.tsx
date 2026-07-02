import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ReportDocModel } from "@/lib/export/report-model";

let registered = false;
function ensureFonts() {
  if (registered) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "Pretendard",
    fonts: [
      { src: path.join(dir, "Pretendard-Regular.otf") },
      { src: path.join(dir, "Pretendard-Bold.otf"), fontWeight: "bold" },
    ],
  });
  registered = true;
}

const s = StyleSheet.create({
  page: { padding: 44, fontFamily: "Pretendard", color: "#1A2421" },
  title: { fontSize: 20, fontWeight: "bold", color: "#057A4E" },
  subtitle: { fontSize: 12, color: "#6b7772", marginTop: 4, marginBottom: 16 },
  accentBar: { height: 3, backgroundColor: "#00E87B", marginBottom: 16 },
  heading: { fontSize: 13, fontWeight: "bold", color: "#057A4E", marginTop: 14, marginBottom: 5 },
  line: { fontSize: 10.5, lineHeight: 1.5, marginBottom: 2 },
});

export async function renderReportPdf(model: ReportDocModel): Promise<Buffer> {
  ensureFonts();
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{model.title}</Text>
        <Text style={s.subtitle}>{model.subtitle}</Text>
        <View style={s.accentBar} />
        {model.sections.map((section, i) => (
          <View key={i} wrap={false}>
            <Text style={s.heading}>{section.heading}</Text>
            {section.lines.map((line, j) => (
              <Text key={j} style={s.line}>
                {line}
              </Text>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
