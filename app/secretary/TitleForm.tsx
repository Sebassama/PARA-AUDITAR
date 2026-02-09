'use client';

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter
} from '@/components/ui/alert-dialog'

import { Upload, X, Eye, Link as LinkIcon, Download } from 'lucide-react'

const facultades = {
  "Facultad de Administración de Empresas": [
    { nombre: "Administración de Empresas", titulo: "Licenciado/a en Administración de Empresas" },
    { nombre: "Finanzas", titulo: "Licenciado/a en Finanzas" },
    { nombre: "Mercadotecnia", titulo: "Licenciado/a en Mercadotecnia" },
    { nombre: "Contabilidad y Auditoría", titulo: "Licenciado/a en Contabilidad y Auditoría" },
    { nombre: "Gestión del Transporte", titulo: "Licenciado/a en Gestión del Transporte" }
  ],
  "Facultad de Ciencias": [
    { nombre: "Ingeniería Química", titulo: "Ingeniero/a Químico/a" },
    { nombre: "Química", titulo: "Químico/a" },
    { nombre: "Ingeniería Ambiental", titulo: "Ingeniero/a Ambiental" },
    { nombre: "Bioquímica y Farmacia", titulo: "Bioquímico/a Farmacéutico/a" },
    { nombre: "Estadística", titulo: "Ingeniero/a Estadística" },
    { nombre: "Matemática", titulo: "Matemático/a" },
    { nombre: "Física", titulo: "Físico/a" }
  ],
  "Facultad de Ciencias Pecuarias": [
    { nombre: "Zootecnia", titulo: "Ingeniero/a en Zootecnia" },
    { nombre: "Agroindustria", titulo: "Ingeniero/a en Agroindustria" },
    { nombre: "Veterinaria", titulo: "Médico Veterinario" }
  ],
  "Facultad de Informática y Electrónica": [
    { nombre: "Diseño Gráfico", titulo: "Licenciado/a en Diseño Gráfico" },
    { nombre: "Electrónica y Automatización", titulo: "Ingeniero/a en Electrónica y Automatización" },
    { nombre: "Telecomunicaciones", titulo: "Ingeniero/a en Telecomunicaciones" },
    { nombre: "Software", titulo: "Ingeniero/a de Software" },
    { nombre: "Tecnologías de la Información", titulo: "Ingeniero/a en Tecnologías de la Información" },
    { nombre: "Telemática", titulo: "Ingeniero/a en Telemática" },
    { nombre: "Electricidad", titulo: "Ingeniero/a en Electricidad" }
  ],
  "Facultad de Mecánica": [
    { nombre: "Mecánica", titulo: "Ingeniero/a en Mecánica" },
    { nombre: "Ingeniería Industrial", titulo: "Ingeniero/a Industrial" },
    { nombre: "Mantenimiento Industrial", titulo: "Ingeniero/a en Mantenimiento Industrial" },
    { nombre: "Ingeniería Automotriz", titulo: "Ingeniero/a Automotriz" }
  ],
  "Facultad de Recursos Naturales": [
    { nombre: "Agronomía", titulo: "Ingeniero/a en Agronomía" },
    { nombre: "Forestal", titulo: "Ingeniero/a Forestal" },
    { nombre: "Turismo", titulo: "Licenciado/a en Turismo" },
    { nombre: "Recursos Naturales Renovables", titulo: "Ingeniero/a en Recursos Naturales Renovables" }
  ],
  "Facultad de Salud Pública": [
    { nombre: "Promoción de la Salud", titulo: "Licenciado/a en Promoción de la Salud" },
    { nombre: "Medicina", titulo: "Médico/a" },
    { nombre: "Nutrición y Dietética", titulo: "Licenciado/a en Nutrición y Dietética" },
    { nombre: "Gastronomía", titulo: "Licenciado/a en Gastronomía" }
  ]
}

export default function TitleForm({ wallet }: { wallet: string | null }) {
  const [nombre, setNombre] = useState('')
  const [facultad, setFacultad] = useState('')
  const [carrera, setCarrera] = useState('')
  const [codigo, setCodigo] = useState('')
  const [numero, setNumero] = useState('')
  const [refrendado, setRefrendado] = useState('')
  const [fecha, setFecha] = useState('')

  const [showSuccess, setShowSuccess] = useState(false)
  const [cidGenerado, setCidGenerado] = useState('')
  const [hashHexGenerado, setHashHexGenerado] = useState<string>('')
  const [anchoring, setAnchoring] = useState(false)
  const [txId, setTxId] = useState<string>('')
  const [round, setRound] = useState<number | null>(null)
  const [confirmedBy, setConfirmedBy] = useState<'algod' | 'indexer-sdk' | 'indexer-rest' | 'unknown' | null>(null)
  const [pending, setPending] = useState(false)

  // Función para obtener la fecha en formato YYYY-MM-DD
  const getFechaMinima = () => {
    const hoy = new Date()
    hoy.setFullYear(hoy.getFullYear() - 1) // Un año atrás
    return hoy.toISOString().split('T')[0]
  }

  const getFechaMaxima = () => {
    const hoy = new Date()
    return hoy.toISOString().split('T')[0] // Fecha actual
  }

  const generarPDF = async () => {
    const existingPdfBytes = await fetch('/titulo_base_final.pdf').then(res => res.arrayBuffer())
    const pdfDoc = await PDFDocument.load(existingPdfBytes)
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman)
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic)
    const page = pdfDoc.getPages()[0]
    const { width } = page.getSize()

    const drawCentered = (text: string, y: number, size = 12) => {
      const textWidth = fontBold.widthOfTextAtSize(text, size)
      page.drawText(text, {
        x: (width - textWidth) / 2,
        y,
        size,
        font: fontBold,
        color: rgb(0, 0, 0)
      })
    }

    const tituloFinal = (facultades as any)[facultad]?.find((c: any) => c.nombre === carrera)?.titulo || carrera

    drawCentered(facultad.replace('Facultad de ', ''), 551, 30)
    drawCentered(tituloFinal, 470, 30)
    drawCentered(nombre, 395, 30)

    // ✅ FIX: Crear fecha sin problemas de zona horaria
    const [year, month, day] = fecha.split('-')
    const fechaLocal = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    
    page.drawText(
      `${fechaLocal.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      { x: 477, y: 252, size: 11, font, color: rgb(0, 0, 0) }
    )

    page.drawText(` ${refrendado}`, { x: 125, y: 80, size: 11, font: fontBold, color: rgb(0, 0, 0) })
    page.drawText(` ${codigo}`, { x: width - 97, y: 80, size: 11, font: fontBold, color: rgb(0, 0, 0) })

    return { bytes: await pdfDoc.save(), tituloFinal }
  }

  const vistaPrevia = async () => {
    try {
      const { bytes } = await generarPDF()
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch {
      toast.error('Error al generar vista previa')
    }
  }

  const descargarOriginal = async () => {
    try {
      const h = hashHexGenerado?.trim()
      if (!h) return toast.error('Aún no hay hash para descargar')
      const url = `/api/download/by-hash/${h}`
      window.open(url, '_blank')


    } catch {
      toast.error('No se pudo iniciar la descarga')
    }
  }

  const subirTitulo = async () => {
    if (!wallet || !nombre || !facultad || !carrera || !codigo || !numero || !refrendado || !fecha) {
      return toast.error('Completa todos los campos')
    }

    setTxId('')
    setRound(null)
    setCidGenerado('')
    setHashHexGenerado('')

    try {
      const { bytes, tituloFinal } = await generarPDF()

      // hash SHA-256 del PDF
      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      const hashHexLower = hashHex.toLowerCase()
      setHashHexGenerado(hashHexLower)

      // 1) Guardar en backend (IPFS + BD opcional)
      const formData = new FormData()
      formData.append('file', new Blob([bytes], { type: 'application/pdf' }), `${nombre}_titulo.pdf`)
      formData.append('wallet', wallet)
      formData.append('hash', hashHexLower)

      const res = await fetch('/api/guardar-titulo', { method: 'POST', body: formData })
      if (res.status === 409) {
        toast.error('Este título ya existe (hash duplicado)')
        return
      }
      if (!res.ok) {
        const e = await res.text().catch(() => '')
        throw new Error(e || 'Error al subir el título')
      }

      const data = await res.json()
      setCidGenerado(data.cid ?? '')
      setShowSuccess(true)
      toast.success('Título guardado (IPFS + BD)')

      // 2) Anclar en Algorand (v1)
      try {
        setAnchoring(true)
        const anchorRes = await fetch('/api/algod/anchorNote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: wallet,
            hashHex: hashHexLower,
            cid: data.cid,
            filename: `${nombre}_titulo.pdf`,
          }),
        })
        const ajson = await anchorRes.json().catch(() => ({} as any))

        if (anchorRes.ok && ajson.txId) {
          setTxId(ajson.txId)
          setConfirmedBy(ajson.confirmedBy || null)
          setRound(ajson.round ?? null)
          setPending(!ajson.round)
          toast.success('Transacción enviada a Algorand')

          // 3) Adjuntar tx a BD (opcional)
          /*
          try {
            await fetch(`/api/certificados/${hashHexLower}/attach-tx`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ txId: ajson.txId, round: ajson.round ?? null }),
            })
          } catch {
            // no crítico
          }
          */

          // 4) ✅ Publicar en el índice IPFS (by-hash y by-owner)
          try {
            const pubRes = await fetch('/api/index/publish-hash', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                hash: hashHexLower,
                pdf_cid: data.cid,
                txid: ajson.txId,
                wallet,
                timestamp: new Date().toISOString(),
                title: tituloFinal,
                owner_name: nombre,
              }),
            })
            if (pubRes.ok) {
              const pubJ = await pubRes.json()
              console.log('[publish-hash] OK', pubJ)
            } else {
              console.warn('[publish-hash] NO OK', await pubRes.text())
            }
          } catch (e) {
            console.warn('[publish-hash] error', e)
          }
        } else {
          toast.error(ajson?.error || 'No se pudo anclar en Algorand')
        }
      } catch (err) {
        console.error('anchor error', err)
        toast.error('Error de red al anclar en Algorand')
      } finally {
        setAnchoring(false)
      }

    } catch (err) {
      console.error(err)
      toast.error('Error al subir el título')
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo Título Académico</CardTitle>
          <CardDescription>Completa los campos antes de generar el PDF.</CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <Input placeholder="Nombre del Estudiante" value={nombre} onChange={e => setNombre(e.target.value)} />

          <Select value={facultad} onValueChange={setFacultad}>
            <SelectTrigger><SelectValue placeholder="Seleccione una facultad" /></SelectTrigger>
            <SelectContent>
              {Object.keys(facultades).map(f => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {facultad && (
            <Select value={carrera} onValueChange={setCarrera}>
              <SelectTrigger><SelectValue placeholder="Seleccione una carrera" /></SelectTrigger>
              <SelectContent>
                {((facultades as any)[facultad] || []).map((c: any, idx: number) => (
                  <SelectItem key={`${facultad}-${idx}`} value={c.nombre}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Input placeholder="Código de Matrícula" value={codigo} onChange={e => setCodigo(e.target.value)} />
          <Input placeholder="Número de Título" value={numero} onChange={e => setNumero(e.target.value)} type="number" />
          <Input placeholder="Refrendado" value={refrendado} onChange={e => setRefrendado(e.target.value)} type="number" />
          <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} min={getFechaMinima()} max={getFechaMaxima()} />

          {hashHexGenerado && (
            <div className="text-sm text-muted-foreground break-words">
              <div><span className="font-semibold">Hash (SHA-256):</span> <span className="font-mono">{hashHexGenerado}</span></div>
            </div>
          )}

          {(txId || round) && (
            <div className="text-sm break-words space-y-1">
              {txId && (
                <>
                  <div className="font-semibold">Transacción (Algorand):</div>
                  <div className="font-mono">{txId}</div>
                </>
              )}
              {typeof round === "number" && (
                <div className="text-sm">
                  <b>Round:</b> {round}
                  {confirmedBy && (
                    <> <span className="mx-2">•</span>
                      <span className="italic">
                        confirmado por {confirmedBy === 'algod' ? 'Algod' :
                          confirmedBy === 'indexer-sdk' ? 'Indexer (SDK)' :
                            confirmedBy === 'indexer-rest' ? 'Indexer (REST)' : '—'}
                      </span>
                    </>
                  )}
                </div>
              )}
              {pending && <div className="text-amber-600 text-sm">Aún pendiente de confirmación…</div>}

              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={descargarOriginal}
                  disabled={!hashHexGenerado}
                  className="inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Descargar PDF (IPFS/Backend)
                </Button>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-end gap-4">
          <Button variant="outline" onClick={vistaPrevia}>
            <Eye className="w-4 h-4" />&nbsp;Vista Previa
          </Button>
          <Button onClick={subirTitulo} disabled={anchoring}>
            <Upload className="w-4 h-4" />&nbsp;{anchoring ? 'Anclando…' : 'Subir Título'}
          </Button>
        </CardFooter>

        <AlertDialog open={showSuccess} onOpenChange={setShowSuccess}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>✅ Título subido con éxito</AlertDialogTitle>
              <AlertDialogDescription className="break-words space-y-3">
                {cidGenerado && (
                  <div className="mt-2">
                    <a
                      href={`https://ipfs.io/ipfs/${cidGenerado}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 underline"
                    >
                      Descargar desde IPFS
                    </a>
                  </div>
                )}

                {txId ? (
                  <div className="space-y-2">
                    <div>Se envió la transacción de anclado:</div>
                    <div className="font-mono">{txId}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={descargarOriginal}
                        disabled={!hashHexGenerado}
                        className="inline-flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" /> Descargar PDF (IPFS/Backend)
                      </Button>
                    </div>
                    {typeof round === 'number' && (
                      <div>Round confirmado: <span className="font-mono">{round}</span></div>
                    )}
                  </div>
                ) : (
                  <>Enviando transacción de anclado…</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button onClick={() => setShowSuccess(false)}>
                <X className="w-4 h-4" /> Cerrar
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </>
  )
}
