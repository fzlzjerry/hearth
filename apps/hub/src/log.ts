import { pino } from 'pino'
import { env } from './env'

export const log = pino({
  level: env.LOG_LEVEL,
  transport: process.stdout.isTTY
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
})

export type Log = typeof log
