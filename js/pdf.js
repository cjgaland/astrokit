/* ==========================================================================
   pdf.js — Un PDF de una página con una imagen, sin librerías
   --------------------------------------------------------------------------
   Un PDF por dentro es texto con «objetos» numerados y una tabla final (xref)
   que dice en qué byte empieza cada uno. Para una sola imagen bastan cinco:
     1 catálogo · 2 lista de páginas · 3 la página · 4 lo que se dibuja · 5 la imagen
   La imagen va tal cual en JPEG (filtro DCTDecode), así que no hay que
   comprimir nada: se copia el JPEG que da el canvas.
   ========================================================================== */

/**
 * @param {Uint8Array} jpeg  bytes de un JPEG
 * @param {number} ancho, alto  tamaño de la imagen en píxeles
 * @param {object} op  { titulo }  (metadato del documento)
 * @returns {Uint8Array} el PDF (A4, horizontal o vertical según la imagen)
 */
export function pdfConImagen(jpeg, ancho, alto, op = {}) {
  const horizontal = ancho > alto;
  const W = horizontal ? 842 : 595, H = horizontal ? 595 : 842;   // A4 en puntos (1/72")
  const margen = 24;
  const k = Math.min((W - 2 * margen) / ancho, (H - 2 * margen) / alto);
  const w = ancho * k, h = alto * k, x = (W - w) / 2, y = (H - h) / 2;
  const n = (v) => v.toFixed(2);
  const contenido = `q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(y)} cm /Im0 Do Q`;
  const titulo = (op.titulo || 'AstroKit').replace(/[()\\]/g, '');

  const codificar = (t) => new TextEncoder().encode(t);
  const partes = [];
  const desplazamientos = [];
  let total = 0;
  const poner = (bytes) => { partes.push(bytes); total += bytes.length; };
  const objeto = (num, cuerpo) => { desplazamientos[num] = total; poner(codificar(`${num} 0 obj\n${cuerpo}\nendobj\n`)); };

  poner(codificar('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  objeto(1, `<< /Type /Catalog /Pages 2 0 R /Info 6 0 R >>`);
  objeto(2, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  objeto(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  objeto(4, `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`);
  // La imagen: cabecera, bytes del JPEG y cierre
  desplazamientos[5] = total;
  poner(codificar(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${ancho} /Height ${alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`));
  poner(jpeg);
  poner(codificar('\nendstream\nendobj\n'));
  objeto(6, `<< /Title (${titulo}) /Producer (AstroKit) >>`);

  const inicioXref = total;
  let xref = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) xref += `${String(desplazamientos[i]).padStart(10, '0')} 00000 n \n`;
  poner(codificar(`${xref}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`));

  const pdf = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { pdf.set(p, pos); pos += p.length; }
  return pdf;
}
