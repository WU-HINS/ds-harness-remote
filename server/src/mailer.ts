export interface MailMessage { to: string; subject: string; text: string }
export interface Mailer { send(message: MailMessage): Promise<void> }

export interface SmtpSettings {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

export const EMPTY_SMTP: SmtpSettings = { host: '', port: 587, secure: false, user: '', pass: '', from: '' }

export function smtpConfigured(config: SmtpSettings | undefined): config is SmtpSettings {
  return Boolean(config && config.host && config.from)
}

/**
 * Thin SMTP adapter. nodemailer is imported dynamically so the server still
 * boots (and self-registration simply stays disabled) when it is absent.
 */
export function createSmtpMailer(config: SmtpSettings): Mailer {
  let transport: any
  const load = async () => {
    if (transport) return transport
    const name = 'nodemailer'
    const mod: any = await import(name)
    transport = mod.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user ? { auth: { user: config.user, pass: config.pass } } : {}),
    })
    return transport
  }
  return {
    async send(message: MailMessage): Promise<void> {
      const client = await load()
      await client.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      })
    },
  }
}
