// Interpretación de los datos de la cédula de ciudadanía colombiana.
//
// Funciones puras (sin DOM) para poder probarlas fuera del navegador.
//
// - Cédula amarilla (hasta 2020): el código PDF417 del reverso trae los datos
//   en texto, en posiciones fijas.
// - Cédula digital (desde 2020): la zona MRZ del reverso (3 líneas de 30
//   caracteres con "<") se lee por OCR. Las fechas traen dígito de control;
//   los nombres no, así que pueden traer errores de lectura.

export type Sexo = "M" | "F";

export interface DatosCedula {
  documento: string;       // número de cédula / NUIP, sin puntos ni ceros a la izquierda
  nombres: string;
  apellidos: string;
  sexo: Sexo | null;
  fechaNacimiento: string | null; // AAAA-MM-DD
  fuente: "codigo" | "mrz";
  // Campos que conviene revisar a mano (lectura sin verificación)
  revisar: Array<"documento" | "nombres" | "apellidos" | "sexo">;
}

const limpiar = (s: string) =>
  s.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();

const sinCerosIzquierda = (s: string) => s.replace(/^0+(?=\d)/, "");

// ---------------------------------------------------------------------------
// PDF417 (cédula amarilla)
// ---------------------------------------------------------------------------
// Posiciones conocidas del código de barras de la cédula amarilla.
const PDF417 = {
  documento: [48, 58],
  apellido1: [58, 81],
  apellido2: [81, 104],
  nombre1: [104, 127],
  nombre2: [127, 150],
  sexo: [151, 152],
  fechaNac: [152, 160],
} as const;

export function parsePdf417(bytes: Uint8Array): DatosCedula | null {
  if (bytes.length < 160) return null;
  // latin1 para conservar Ñ y tildes
  let texto = "";
  for (const b of bytes) texto += String.fromCharCode(b);
  const campo = (k: keyof typeof PDF417) => limpiar(texto.slice(PDF417[k][0], PDF417[k][1]));

  const documento = sinCerosIzquierda(campo("documento"));
  const apellidos = limpiar(`${campo("apellido1")} ${campo("apellido2")}`);
  const nombres = limpiar(`${campo("nombre1")} ${campo("nombre2")}`);
  const sexo = campo("sexo");
  const fecha = campo("fechaNac");

  const nombreValido = (s: string) => /^[A-ZÑÁÉÍÓÚÜ' -]{2,}$/i.test(s);
  if (!/^\d{5,10}$/.test(documento) || !nombreValido(apellidos) || !nombreValido(nombres)) {
    return null; // no es una cédula con el formato esperado
  }

  return {
    documento,
    nombres,
    apellidos,
    sexo: sexo === "M" || sexo === "F" ? sexo : null,
    fechaNacimiento: /^\d{8}$/.test(fecha)
      ? `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}`
      : null,
    fuente: "codigo",
    revisar: [],
  };
}

// ---------------------------------------------------------------------------
// MRZ TD1 (cédula digital)
// ---------------------------------------------------------------------------
function digitoControl(s: string): number {
  const pesos = [7, 3, 1];
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const v = c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55;
    total += v * pesos[i % 3];
  }
  return total % 10;
}

// En campos numéricos el OCR suele confundir letras con dígitos
const aDigitos = (s: string) =>
  s.replace(/O|Q|D/g, "0").replace(/I|L/g, "1").replace(/Z/g, "2").replace(/S/g, "5").replace(/B/g, "8");

function fechaMrz(yymmdd: string, esNacimiento: boolean): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const actual = new Date().getFullYear() % 100;
  const siglo = esNacimiento ? (yy > actual ? 1900 : 2000) : 2000;
  return `${siglo + yy}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

export function parseMrz(textoOcr: string): DatosCedula | null {
  const lineas = textoOcr
    .toUpperCase()
    .split(/\r?\n/)
    .map(l => l.replace(/[^A-Z0-9<]/g, ""))
    .filter(l => l.length >= 20);

  // Línea 2: fecha nac (6) + dígito + sexo + vencimiento (6) + dígito + nacionalidad
  const patronL2 = /^([0-9OQDILZSB]{6})([0-9OQDILZSB])([MF<])([0-9OQDILZSB]{6})([0-9OQDILZSB])(C[O0]L)/;
  const i2 = lineas.findIndex(l => patronL2.test(l));
  if (i2 < 0) return null;
  const l2 = lineas[i2];
  const l1 = i2 > 0 ? lineas[i2 - 1] : "";
  const l3 = lineas[i2 + 1] ?? "";

  const m = patronL2.exec(l2)!;
  const nac = aDigitos(m[1]);
  const nacOk = digitoControl(nac) === Number(aDigitos(m[2]));
  const venc = aDigitos(m[4]);

  // Datos opcionales (posiciones 18-28): en Colombia es el NUIP
  const opcional = aDigitos(l2.slice(18, 29).replace(/<+$/, ""));
  const documento = sinCerosIzquierda(opcional.replace(/<.*$/, ""));
  if (!/^\d{5,11}$/.test(documento)) return null;

  // Dígito de control compuesto: valida el NUIP si la línea 1 se leyó bien
  let documentoOk = false;
  if (l1.length >= 30 && l2.length >= 30) {
    const l1n = l1.slice(0, 5) + aDigitos(l1.slice(5, 15)) + l1.slice(15, 30);
    const l2n = nac + aDigitos(m[2]) + m[3] + venc + aDigitos(m[5]) + "COL" +
      aDigitos(l2.slice(18, 29));
    const compuesto = l1n.slice(5, 30) + l2n.slice(0, 7) + l2n.slice(8, 15) + l2n.slice(18, 29);
    documentoOk = digitoControl(compuesto) === Number(aDigitos(l2[29]));
  }

  // Línea 3: APELLIDOS<<NOMBRES, con "<" entre palabras y relleno al final
  const sinRelleno = l3.replace(/[<KL]{3,}$/, "").replace(/<+$/, "");
  const sep = sinRelleno.indexOf("<<");
  const apellidos = sep >= 0 ? limpiar(sinRelleno.slice(0, sep).replace(/</g, " ")) : "";
  const nombres = sep >= 0 ? limpiar(sinRelleno.slice(sep + 2).replace(/</g, " ")) : "";

  const revisar: DatosCedula["revisar"] = [];
  if (!documentoOk) revisar.push("documento");
  // Los nombres no tienen dígito de control: siempre se marcan para revisar
  revisar.push("nombres", "apellidos");
  if (!nacOk) revisar.push("sexo");

  return {
    documento,
    nombres,
    apellidos,
    sexo: m[3] === "M" || m[3] === "F" ? m[3] : null,
    fechaNacimiento: nacOk ? fechaMrz(nac, true) : null,
    fuente: "mrz",
    revisar,
  };
}
