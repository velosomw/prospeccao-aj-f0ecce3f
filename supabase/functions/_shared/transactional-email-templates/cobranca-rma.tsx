/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link,
  Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'BEx RMA IA'

interface CobrancaProps {
  subject?: string
  message?: string
  fileName?: string
  fileUrl?: string
  rmaId?: string
  companyName?: string
}

const CobrancaEmail = ({
  message,
  fileName,
  fileUrl,
  rmaId,
  companyName,
}: CobrancaProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Solicitação de documentos — {companyName ?? 'RMA'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{SITE_NAME}</Heading>
        {(rmaId || companyName) && (
          <Text style={meta}>
            {rmaId ? `${rmaId}` : ''}{rmaId && companyName ? ' · ' : ''}{companyName ?? ''}
          </Text>
        )}
        <Hr style={hr} />
        {(message ?? '').split('\n').map((line, i) => (
          <Text key={i} style={text}>{line || '\u00A0'}</Text>
        ))}
        {fileUrl && fileName && (
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={fileUrl} style={button}>
              📎 Baixar anexo: {fileName}
            </Button>
            <Text style={small}>
              Ou acesse pelo link:{' '}
              <Link href={fileUrl} style={link}>{fileUrl}</Link>
            </Text>
          </Section>
        )}
        <Hr style={hr} />
        <Text style={footer}>
          Este e-mail foi enviado pela plataforma {SITE_NAME} como parte do
          processo de Registro e Cobrança do RMA.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CobrancaEmail,
  subject: (d: Record<string, any>) =>
    d.subject || 'Solicitação de documentos — Registro e Cobrança',
  displayName: 'Cobrança RMA',
  previewData: {
    subject: 'Solicitação de documentos — RMA-0002 DIPLOMATA',
    message:
      'Prezados,\n\nSolicitamos o envio dos documentos pendentes para regularização do RMA referente ao mês corrente.\n\nAtenciosamente,\nEquipe BEx RMA IA',
    fileName: 'relatorio-cobranca.pdf',
    fileUrl: 'https://example.com/file.pdf',
    rmaId: 'RMA-0002',
    companyName: 'DIPLOMATA',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Plus Jakarta Sans", "Inter", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '600px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: 'hsl(222, 47%, 14%)', margin: '0 0 4px' }
const meta = { fontSize: '12px', color: 'hsl(222, 20%, 45%)', margin: '0 0 12px' }
const hr = { borderColor: '#e5e7eb', margin: '20px 0' }
const text = { fontSize: '14px', color: 'hsl(222, 30%, 25%)', lineHeight: '1.6', margin: '0 0 12px' }
const button = {
  backgroundColor: 'hsl(217, 91%, 50%)',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 600,
  display: 'inline-block',
}
const small = { fontSize: '11px', color: '#6b7280', margin: '12px 0 0' }
const link = { color: 'hsl(217, 91%, 50%)', wordBreak: 'break-all' as const }
const footer = { fontSize: '11px', color: '#9ca3af', margin: '0' }
