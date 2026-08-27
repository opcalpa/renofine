/**
 * Momsmatematiken, körbar: `npx tsx scripts/check-vat.ts`.
 *
 * Projektet har ingen unit-test-runner. Det här är den lilla grinden som
 * skyddar det enda stället där moms räknas, så att en framtida ändring inte
 * tyst börjar smeta ut moms per rad eller gissa en sats som inte stämmer.
 */
import { splitDocumentVat, inferVatRate, vatFromGross, lineVat, purchaseVatFields } from "../src/lib/vat";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); }
  else console.log("ok  ", name, JSON.stringify(got));
};

// Ett vanligt Bauhaus-kvitto: 1250 kr inkl 25 %
eq("25% kvitto", splitDocumentVat(1250, 250), { net: 1000, vat: 250, rate: 25 });
// Öresavrundning i OCR
eq("25% avrundat", splitDocumentVat(1249.5, 249.9), { net: 999.6, vat: 249.9, rate: 25 });
// 12 % (restaurang/vissa varor)
eq("12%", splitDocumentVat(1120, 120), { net: 1000, vat: 120, rate: 12 });
// 6 %
eq("6%", splitDocumentVat(1060, 60), { net: 1000, vat: 60, rate: 6 });
// 0 % — omvänd betalningsskyldighet på en leverantörsfaktura
eq("0%", splitDocumentVat(10000, 0), { net: 10000, vat: 0, rate: 0 });
// Blandade satser: momsen förklaras av ingen enskild sats
eq("blandat", splitDocumentVat(1180, 180), { net: 1000, vat: 180, rate: null });
// Okänd moms
eq("okänd", splitDocumentVat(1250, null), null);
eq("moms = brutto", splitDocumentVat(100, 100), null);
eq("negativ moms", splitDocumentVat(100, -5), null);
eq("noll brutto", splitDocumentVat(0, 0), null);

// Radmoms bara vid entydig sats
eq("rad 25%", lineVat(500, 25), { vat_rate: 25, vat_amount: 100 });
eq("rad blandat", lineVat(500, null), { vat_rate: null, vat_amount: null });
eq("rad utan belopp", lineVat(null, 25), { vat_rate: null, vat_amount: null });

// PO-fälten
eq("po-fält", purchaseVatFields(1250, 250), { vat_amount: 250, net_amount: 1000, vat_rate: 25 });
eq("po-fält okänd", purchaseVatFields(1250, undefined), { vat_amount: null, net_amount: null, vat_rate: null });

// Radsumman ska stämma mot huvudet vid en sats
const lines = [400, 600, 250];
const sum = lines.reduce((s, l) => s + (lineVat(l, 25).vat_amount ?? 0), 0);
eq("radsumma = huvudmoms", Math.round(sum * 100) / 100, 250);

// Små belopp där toleransen kan slå fel
eq("litet 25%", inferVatRate(25, 5), 25);
eq("litet 0 kr moms", inferVatRate(25, 0), 0);
eq("litet 6%", inferVatRate(106, 6), 6);

console.log(fails === 0 ? "\nALLA OK" : `\n${fails} FEL`);
process.exit(fails === 0 ? 0 : 1);
