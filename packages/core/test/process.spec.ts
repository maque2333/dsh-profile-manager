import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { isAlive, stopPid } from '../src/process.js'

let children: number[] = []
afterEach(async () => {
  for (const pid of children.splice(0)) {
    if (isAlive(pid)) await stopPid(pid, 1000)
  }
})

describe('isAlive', () => {
  it('当前进程存活', () => {
    expect(isAlive(process.pid)).toBe(true)
  })
  it('不存在的 pid → false', () => {
    expect(isAlive(999_999_999)).toBe(false)
  })
})

describe('stopPid', () => {
  it('优雅停止：SIGTERM 让 sleep 进程退出', async () => {
    const child = spawn('sleep', ['30'])
    children.push(child.pid!)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(isAlive(child.pid!)).toBe(true)
    const result = await stopPid(child.pid!, 5000)
    expect(result).toBe('graceful')
    expect(isAlive(child.pid!)).toBe(false)
  })
  it('已死 pid → already-stopped', async () => {
    expect(await stopPid(999_999_999, 500)).toBe('already-stopped')
  })
})
