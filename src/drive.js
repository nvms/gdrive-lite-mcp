// Google Drive's REST API, read only: finding files, reading Google's own
// documents as text, and saving any file to a folder.

import { mkdir, stat, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join } from 'node:path'
import { accessToken } from './auth.js'

const API = 'https://www.googleapis.com/drive/v3'
const FIELDS = 'id,name,mimeType,modifiedTime,size,webViewLink,owners(displayName)'

async function request(path, params = {}) {
  const url = new URL(`${API}${path}`)
  for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, String(value))
  const response = await fetch(url, { headers: { authorization: `Bearer ${await accessToken()}` } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(`Google Drive: ${body.error?.message || response.status}`)
  }
  return response
}
const json = async (path, params) => (await request(path, params)).json()

// Google's own formats, as text to read and as a file to keep
const NATIVE = {
  'application/vnd.google-apps.document': { kind: 'Doc', text: 'text/markdown', file: ['application/pdf', '.pdf'] },
  'application/vnd.google-apps.spreadsheet': { kind: 'Sheet', text: 'text/csv', file: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'] },
  'application/vnd.google-apps.presentation': { kind: 'Slides', text: 'text/plain', file: ['application/pdf', '.pdf'] },
}

function view(file) {
  return {
    id: file.id,
    name: file.name,
    type: NATIVE[file.mimeType]?.kind ?? (file.mimeType === 'application/vnd.google-apps.folder' ? 'Folder' : file.mimeType),
    modified: file.modifiedTime,
    owner: file.owners?.[0]?.displayName ?? null,
    size: file.size ? Number(file.size) : null,
    link: file.webViewLink,
  }
}

const quote = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

export async function search({ text, query, max = 20, pageToken }) {
  const terms = [query, text && `fullText contains ${quote(text)}`, 'trashed = false'].filter(Boolean)
  const list = await json('/files', {
    q: terms.join(' and '),
    fields: `nextPageToken,files(${FIELDS})`,
    pageSize: Math.min(Math.max(1, max), 100),
    orderBy: text ? null : 'modifiedTime desc',
    pageToken,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return { files: (list.files ?? []).map(view), next_page_token: list.nextPageToken ?? null }
}

const meta = (id) => json(`/files/${id}`, { fields: FIELDS, supportsAllDrives: true })

export async function read({ id }) {
  const file = await meta(id)
  const native = NATIVE[file.mimeType]
  let response
  if (native) response = await request(`/files/${id}/export`, { mimeType: native.text })
  else if (/^text\/|json$|xml$/.test(file.mimeType)) response = await request(`/files/${id}`, { alt: 'media', supportsAllDrives: true })
  else throw new Error(`${file.name} is a ${file.mimeType} file, which has no text to read here; download it instead`)
  return { ...view(file), text: await response.text() }
}

// a name not yet taken in the folder: a number is added rather than overwriting
async function freeName(folder, name) {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : `${stem} (${n})${ext}`
    if (!await stat(join(folder, candidate)).catch(() => null)) return candidate
  }
}

export async function download({ id, folder }) {
  if (!isAbsolute(folder)) throw new Error('folder must be an absolute path')
  const file = await meta(id)
  if (file.mimeType === 'application/vnd.google-apps.folder') throw new Error(`${file.name} is a folder`)
  const native = NATIVE[file.mimeType]
  const response = native
    ? await request(`/files/${id}/export`, { mimeType: native.file[0] })
    : await request(`/files/${id}`, { alt: 'media', supportsAllDrives: true })
  const safe = file.name.replace(/[/\\]/g, '-').replace(/^\.+/, '') || 'file'
  const named = native && !safe.toLowerCase().endsWith(native.file[1]) ? safe + native.file[1] : safe
  await mkdir(folder, { recursive: true })
  const path = join(folder, await freeName(folder, named))
  await writeFile(path, Buffer.from(await response.arrayBuffer()))
  return { ...view(file), path }
}
