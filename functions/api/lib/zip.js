// Armador de archivos .zip mínimo, sin dependencias externas.
// Usa método "store" (sin compresión): más liviano de implementar, no
// necesita ninguna librería, y evita el problema de que el build de
// Cloudflare Pages (dashboard/Git) no corre `npm install` antes de
// bundlear las Functions. La mayoría de lo que se sube acá ya viene
// comprimido (PDF, imágenes), así que perder la compresión del zip no
// tiene costo real.

// Tabla de CRC-32 (estándar, polinomio 0xEDB88320)
const CRC_TABLE = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fechaHoraDos(date = new Date()) {
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

class ByteWriter {
  constructor() {
    this.partes = [];
    this.longitud = 0;
  }
  push(uint8array) {
    this.partes.push(uint8array);
    this.longitud += uint8array.length;
  }
  u16(valor) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, valor, true);
    this.push(b);
  }
  u32(valor) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, valor, true);
    this.push(b);
  }
  ascii(str) {
    this.push(new TextEncoder().encode(str));
  }
  toUint8Array() {
    const resultado = new Uint8Array(this.longitud);
    let offset = 0;
    for (const parte of this.partes) {
      resultado.set(parte, offset);
      offset += parte.length;
    }
    return resultado;
  }
}

/**
 * Arma un .zip (sin comprimir) a partir de { nombre: Uint8Array }.
 * @param {Record<string, Uint8Array>} archivos
 * @returns {Uint8Array}
 */
export function crearZip(archivos) {
  const { dosTime, dosDate } = fechaHoraDos();
  const encoder = new TextEncoder();
  const entradas = [];
  const salida = new ByteWriter();

  for (const [nombre, datos] of Object.entries(archivos)) {
    const nombreBytes = encoder.encode(nombre);
    const crc = crc32(datos);
    const offsetLocal = salida.longitud;

    // ---- local file header ----
    salida.u32(0x04034b50);
    salida.u16(20); // versión necesaria
    salida.u16(0); // flags
    salida.u16(0); // método: 0 = store (sin comprimir)
    salida.u16(dosTime);
    salida.u16(dosDate);
    salida.u32(crc);
    salida.u32(datos.length); // tamaño comprimido = tamaño real (store)
    salida.u32(datos.length); // tamaño original
    salida.u16(nombreBytes.length);
    salida.u16(0); // extra field length
    salida.push(nombreBytes);
    salida.push(datos);

    entradas.push({ nombreBytes, crc, tamano: datos.length, offsetLocal });
  }

  const offsetCentral = salida.longitud;

  for (const e of entradas) {
    salida.u32(0x02014b50);
    salida.u16(20); // versión que lo creó
    salida.u16(20); // versión necesaria
    salida.u16(0); // flags
    salida.u16(0); // método
    salida.u16(dosTime);
    salida.u16(dosDate);
    salida.u32(e.crc);
    salida.u32(e.tamano);
    salida.u32(e.tamano);
    salida.u16(e.nombreBytes.length);
    salida.u16(0); // extra
    salida.u16(0); // comentario
    salida.u16(0); // disco inicial
    salida.u16(0); // atributos internos
    salida.u32(0); // atributos externos
    salida.u32(e.offsetLocal);
    salida.push(e.nombreBytes);
  }

  const tamanoCentral = salida.longitud - offsetCentral;

  // ---- end of central directory ----
  salida.u32(0x06054b50);
  salida.u16(0); // número de disco
  salida.u16(0); // disco con inicio del central directory
  salida.u16(entradas.length);
  salida.u16(entradas.length);
  salida.u32(tamanoCentral);
  salida.u32(offsetCentral);
  salida.u16(0); // comentario

  return salida.toUint8Array();
}
