import { ClassicRingSkin } from './classic'

const skinRegistry = new Map()

// Register default skin
const defaultSkin = new ClassicRingSkin()
skinRegistry.set(defaultSkin.id, defaultSkin)

/**
 * Retrieves a skin adapter by ID, falling back to classic.
 * @param {string} id
 * @returns {RingSkin}
 */
export function getSkin(id) {
  return skinRegistry.get(id) || defaultSkin
}

/**
 * Registers an additional skin adapter.
 * @param {RingSkin} skin
 */
export function registerSkin(skin) {
  if (!skin || !skin.id) {
    throw new Error('Invalid skin adapter: missing id')
  }
  skinRegistry.set(skin.id, skin)
}

/**
 * Returns all available skins.
 * @returns {RingSkin[]}
 */
export function getAvailableSkins() {
  return Array.from(skinRegistry.values())
}
