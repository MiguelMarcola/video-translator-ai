# Validação em 28/10/2026

Máquina: macOS arm64, 32 GB de RAM, FFmpeg 7.1.1 com `libass`, Python 3.13.3, Node 24.19.0. O vídeo de prova tem cerca de 25 segundos, 640x360, fala sintética em inglês e áudio AAC original.

## Pipeline direto

`pnpm prove:media` terminou com sucesso. Tempos e memória máxima medidos em `var/prove/report.json`:

| Etapa | Duração | RSS máximo |
| --- | ---: | ---: |
| acquire | 0 ms | 29 MB |
| prepare | 606 ms | 30 MB |
| transcribe | 1.553 ms | 514 MB |
| translate | 6.882 ms | 880 MB |
| write_subtitles | 0 ms | 880 MB |
| render | 292 ms | 880 MB |
| Total | 9.357 ms |  |

O modelo foi faster-whisper `base`, CPU, `int8`. A tradução usou Argos `en` para `pb`, pacote 1.9. IDs e timestamps foram preservados. O VTT e o SRT estão em UTF-8, com no máximo duas linhas. Os acentos `vídeo`, `áudio`, `inglês` e `legível` aparecem no arquivo e nos quadros extraídos do MP4 gravado, no início (3 s), no meio (15 s) e no fim (22 s). O MP4 gravado tem H.264, AAC e 27,1 segundos. O áudio não foi substituído por outra faixa de voz.

O modelo `base` ouviu "local translation" como "Oracle Translation" e "accents" como "accepting" nessa fala sintética. Isso é limitação da transcrição medida, não um descarte de timestamps.

## Jornada com fila

Um arquivo local autorizado passou por ingest, prepare, transcribe, translate e write_subtitles. A reprodução e as legendas ficaram prontas. Sem `OPENAI_API_KEY` e sem modelos configurados, resumo e chat terminaram como `unavailable` e o projeto ficou `ready`. A interface mostrou essas duas indisponibilidades e o aviso de que a análise cobre a fala transcrita.

Foi conferido:

- `GET /videos/:id/playback` com `video/mp4` e trilha `text/vtt`
- `Range: bytes=0-99` respondendo 206, `Content-Range` e `Accept-Ranges`
- CORS para `http://localhost:5173` e, em desenvolvimento, também para `127.0.0.1`
- SRT e VTT com os quatro segmentos
- exportação do MP4 gravado e reutilização imediata na segunda solicitação
- ausência de cabeçalho de identidade respondendo 401
- outro usuário respondendo 404
- assinatura de mídia inválida respondendo 403

A página de resultado carregou o vídeo até `readyState` 4, com a trilha "Português (Brasil)". A tela inicial oferece somente português do Brasil. O histórico listou o projeto concluído.

## Exclusão durante o processamento

Um segundo projeto foi excluído depois que a obtenção terminou e enquanto a preparação ainda estava pendente. A API respondeu `deleting` e, em seguida, 404. No banco o estado ficou `deleted`, com zero artefatos e zero segmentos. A etapa pendente não recriou arquivos.

## Testes automáticos

- 14 testes Vitest dos contratos
- 2 testes da interface
- 7 testes pytest de legendas, tradução por segmento e contrato

## Não executado

- Download real de um vídeo do YouTube
- Resumo e chat com a API da OpenAI, porque não havia chave nem modelos configurados
- Playwright
- Build da imagem Docker do worker Python
- Publicação ou infraestrutura paga
