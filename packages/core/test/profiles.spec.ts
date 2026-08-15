import { describe, expect, it } from 'vitest'
import { classifyShape } from '../src/profiles.js'
import { isValidProfileName, resolveDshHome } from '../src/paths.js'

describe('classifyShape', () => {
  it('web 形态：bundles 含 dsh-web-app', () => {
    expect(classifyShape(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])).toBe('web')
  })
  it('headless 形态：bundles 含 dsh-headless', () => {
    expect(classifyShape(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])).toBe('headless')
  })
  it('generic 形态：两者皆无（如 cc-tui）', () => {
    expect(classifyShape(['@deepseek-ai/dsh-base', 'dsh-cc-tui'])).toBe('generic')
  })
})

describe('isValidProfileName', () => {
  it('接受普通 kebab 名', () => {
    expect(isValidProfileName('writing')).toBe(true)
    expect(isValidProfileName('my-profile-2')).toBe(true)
  })
  it('拒绝路径与保留名', () => {
    expect(isValidProfileName('')).toBe(false)
    expect(isValidProfileName('.')).toBe(false)
    expect(isValidProfileName('..')).toBe(false)
    expect(isValidProfileName('node_modules')).toBe(false)
    expect(isValidProfileName('a/b')).toBe(false)
    expect(isValidProfileName('a\\b')).toBe(false)
  })
})

describe('resolveDshHome', () => {
  it('环境变量优先（非空白）', () => {
    expect(resolveDshHome({ DSH_HOME: '/tmp/test-home' })).toBe('/tmp/test-home')
    expect(resolveDshHome({ DSH_HOME: '  ' })).not.toBe('  ')
  })
  it('默认落到 ~/.dsh', () => {
    expect(resolveDshHome({}).endsWith('/.dsh')).toBe(true)
  })
})
