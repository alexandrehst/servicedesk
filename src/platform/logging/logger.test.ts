import { describe, expect, it, vi } from 'vitest'
import { criarLogger } from './logger.js'

describe('criarLogger', () => {
  it('escreve uma linha de JSON por evento', () => {
    const linhas: string[] = []
    criarLogger((linha) => linhas.push(linha)).erro('falhou', { numero: 1042 })

    expect(linhas).toHaveLength(1)
    expect(JSON.parse(linhas[0] ?? '{}')).toEqual({
      nivel: 'erro',
      evento: 'falhou',
      numero: 1042,
    })
  })

  /**
   * `aviso` entrou na Story 1.9, para as recusas do intake por e-mail. O nivel
   * distinto e o ponto: registrar recusa esperada como `erro` treinaria quem
   * monitora a ignorar erro.
   */
  it('marca aviso com nivel proprio, distinto de erro', () => {
    const linhas: string[] = []
    criarLogger((linha) => linhas.push(linha)).aviso('intake_de_email_recusado', {
      motivo: 'remetente_desconhecido',
    })

    expect(JSON.parse(linhas[0] ?? '{}')).toEqual({
      nivel: 'aviso',
      evento: 'intake_de_email_recusado',
      motivo: 'remetente_desconhecido',
    })
  })

  it('nao quebra a linha, para o coletor conseguir separar eventos', () => {
    const linhas: string[] = []
    criarLogger((linha) => linhas.push(linha)).erro('falhou', { causa: 'erro\ncom quebra' })

    // JSON.stringify escapa a quebra; um log multilinha viraria dois eventos
    // truncados no coletor.
    expect(linhas[0]).not.toContain('\n')
  })

  it('escreve em stderr por padrao, nunca em stdout', () => {
    const emErro = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const emSaida = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    criarLogger().erro('falhou', { numero: 7 })

    // O transporte MCP padrao e stdio: o `stdout` carrega o protocolo, e um log
    // ali corromperia a conversa com o cliente.
    expect(emErro).toHaveBeenCalledTimes(1)
    expect(emSaida).not.toHaveBeenCalled()
    expect(String(emErro.mock.calls[0]?.[0])).toContain('"evento":"falhou"')

    emErro.mockRestore()
    emSaida.mockRestore()
  })
})
