import { describe, expect, it } from 'bun:test'
import {
  attachArgv,
  attachCommand,
  newDetachedArgv,
  newDetachedCommand,
  isValidSessionName,
} from './tmux'

describe('attachArgv', () => {
  it('attaches-or-creates with no start dir by default', () => {
    expect(attachArgv('work')).toEqual(['new-session', '-A', '-s', 'work'])
  })
  it('pins the start directory with -c when given', () => {
    expect(attachArgv('work', '/home/me')).toEqual(['new-session', '-A', '-s', 'work', '-c', '/home/me'])
  })
})

describe('newDetachedArgv', () => {
  it('creates detached with no start dir by default', () => {
    expect(newDetachedArgv('work')).toEqual(['new-session', '-d', '-s', 'work'])
  })
  it('pins the start directory with -c when given', () => {
    expect(newDetachedArgv('work', '/srv/app')).toEqual(['new-session', '-d', '-s', 'work', '-c', '/srv/app'])
  })
})

describe('attachCommand (remote shell form)', () => {
  it('omits -c by default so it inherits the SSH login dir (~)', () => {
    expect(attachCommand('work')).toBe("tmux new-session -A -s 'work'")
  })
  it('single-quotes an explicit start dir', () => {
    expect(attachCommand('work', '/home/me')).toBe("tmux new-session -A -s 'work' -c '/home/me'")
  })
})

describe('newDetachedCommand (remote shell form)', () => {
  it('omits -c by default', () => {
    expect(newDetachedCommand('work')).toBe("tmux new-session -d -s 'work'")
  })
  it('single-quotes an explicit start dir', () => {
    expect(newDetachedCommand('work', '/srv/app')).toBe("tmux new-session -d -s 'work' -c '/srv/app'")
  })
})

describe('isValidSessionName', () => {
  it('accepts the allowlisted charset', () => {
    expect(isValidSessionName('my_work-1.2')).toBe(true)
  })
  it('rejects names with shell metacharacters', () => {
    expect(isValidSessionName('a; rm -rf /')).toBe(false)
    expect(isValidSessionName('')).toBe(false)
  })
})
