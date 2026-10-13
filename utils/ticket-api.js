import { request } from './api.js'

function payload(body) {
  if (!body || body.result !== 100 || !body.data || typeof body.data !== 'object') {
    throw new Error('Invalid ticket response')
  }
  return body.data
}

export async function ticketArchive(filters, userKey = '', { timeout = 45000 } = {}) {
  const d = payload(await request('/ticket/archive', filters, 'get', userKey, { timeout }))
  if (!Array.isArray(d.list) || !Number.isSafeInteger(d.total) || d.total < 0 ||
      !Number.isSafeInteger(d.page) || d.page < 1 || !Number.isSafeInteger(d.pageSize) || d.pageSize < 1) {
    throw new Error('Invalid ticket archive')
  }
  return d
}

export async function ticketShow(key, userKey = '') {
  const d = payload(await request('/ticket/show', { id: key }, 'get', userKey))
  if (!d.key || !d.name) throw new Error('Invalid ticket show')
  return d
}

export async function ticketOptions(kind, userKey = '') {
  const d = payload(await request(kind === 'cities' ? '/ticket/cities' : '/ticket/categories', {}, 'get', userKey))
  const list = kind === 'cities' ? d.cities : d.list
  if (!Array.isArray(list)) throw new Error('Invalid ticket options')
  return list
}

export async function ticketSync(city, userKey = '', { detailLimit = 80 } = {}) {
  return payload(await request('/ticket/sync', { city, limit: 1, detailLimit }, 'post', userKey, { timeout: 180000 }))
}
