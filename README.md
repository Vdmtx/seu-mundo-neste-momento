# Seu Mundo Neste Momento

Monitor global estático para GitHub Pages. O projeto consulta fontes públicas, mostra origem e horário de cada leitura e nunca substitui uma fonte indisponível por valores aleatórios.

## O que está funcional

- Globo 3D com mapa 2D automático para aparelhos sem WebGL.
- Ícones vetoriais próprios e consistentes no mapa 2D, no globo 3D, na lista de categorias e no feed; o desenho identifica a situação e a borda colorida identifica a gravidade. Em escala global, ocorrências próximas da mesma categoria são agrupadas para reduzir sobreposição e preservar desempenho.
- Temas claro e escuro com preferência salva no navegador; o mapa 2D troca de cartografia e contraste conforme o tema.
- Campo térmico contínuo no mapa 2D e no globo 3D, derivado da grade NOAA/NCEP GFS 0,25° obtida pelo NOMADS. A textura usa a grade nativa; a leitura interativa usa uma redução de 1°, com escala em Celsius e horário da rodada.
- Terremotos, anéis sísmicos, eventos naturais, desastres GDACS e alertas ativos de tsunami.
- Posição e trilha recente da ISS.
- Índice Kp, Bz, vento solar e previsão NOAA OVATION de auroras.
- Camadas opcionais de temperatura global e qualidade do ar.
- Linha astronômica aproximada de dia/noite.
- Imagem diária VIIRS do NASA GIBS, carregada somente quando solicitada.
- 4.589 estados, províncias e subdivisões do Natural Earth, representados por pontos administrativos carregados sob demanda; um clique filtra o cache recente de notícias e oferece busca externa quando não há correspondência.
- Camada opcional “Conflitos na imprensa”, limitada a manchetes das últimas 24 horas no idioma selecionado e geolocalizada somente quando há menção explícita a um estado, província ou país. Seus pontos são referências editoriais, não coordenadas militares.
- Clima pontual, diretório externo de câmeras públicas e alertas críticos locais do navegador enquanto o site está aberto.
- Indicador de frescor por fonte, distinguindo horário de publicação e horário da última consulta do monitor.
- Página permanente de metodologia e integridade, em português, inglês e espanhol, com intervalos, limitações, critérios de risco, regras para conflitos e incidentes sensíveis, privacidade e canal público de correções.
- “Meu Mundo” local e sem cadastro: até 20 estados, províncias ou países de referência, categorias prioritárias, filtro opcional no mapa e preferência entre mapa 2D e globo 3D. As escolhas ficam somente no navegador.
- Ficha detalhada de cada ocorrência com categoria, indicador, fonte, horário, coordenadas e link original.
- Compartilhamento contextual com fonte e horário, usando o menu nativo do aparelho ou cópia para a área de transferência.

## Fontes e intervalos

- USGS: terremotos de magnitude 2,5 ou maior nas últimas 24 horas; navegador a cada 5 minutos.
- NASA EONET: eventos naturais abertos; navegador a cada 5 minutos.
- GDACS: ciclones, inundações, vulcões, secas e incêndios; snapshot do GitHub Actions a cada 15 minutos.
- NOAA Tsunami Warning Centers: somente Warning, Watch, Advisory ou Threat ativos; snapshot a cada 15 minutos.
- NOAA SWPC: Kp, Bz, vento solar e OVATION; navegador a cada 5 minutos e snapshot de contingência.
- Where The ISS At: posição da ISS a cada 10 segundos.
- NOAA/NCEP NOMADS: temperatura do ar a 2 m da rodada GFS 0,25° mais recente disponível, usando a hora de previsão válida mais próxima do momento da atualização. O campo é processado aproximadamente quatro vezes ao dia e identificado como estimativa de modelo meteorológico.
- Open-Meteo: clima pontual, temperatura sob demanda, contingência térmica quando o NOMADS estiver indisponível e grade de qualidade do ar atualizada no snapshot a cada 15 minutos.
- Google News RSS: cache de manchetes públicas em português, inglês e espanhol, reconstruído pelo GitHub Actions a cada 15 minutos. A busca do site filtra esse conjunto e não promete cobertura completa de todos os estados.
- Google News RSS — conflitos: consulta temática separada, também a cada 15 minutos. Ela indica cobertura jornalística e não confirma de forma independente o conteúdo publicado.
- NASA GIBS: imagem VIIRS do dia anterior, sob demanda.
- Natural Earth Admin-1: pontos administrativos estáticos, compactados para desempenho. Dados em domínio público.

O GitHub Actions consolida e republica o snapshot a cada 15 minutos sem criar commits automáticos no histórico. Cada provedor tem sua própria latência; “tempo quase real” significa a leitura mais recente efetivamente publicada por ele.

## Limites e segurança

O GitHub Pages não executa um servidor. APIs podem impor limites, bloquear CORS ou ficar temporariamente fora do ar. Notícias não garantem cobertura uniforme nem representam confirmação independente. Câmeras podem atrasar, sair do ar ou não mostrar o evento selecionado.

O monitor não calcula nem publica trajetória de armamentos, previsão própria de impacto de míssil ou autoria não confirmada. A camada jornalística de conflitos permanece visualmente e textualmente separada dos eventos confirmados. Incidentes nucleares, radiológicos e biológicos/químicos só devem ser incorporados como ocorrências a partir de alertas civis ou autoridades reconhecidas, com localização compatível com o que a fonte tornou público.

As categorias nuclear/radiológica e biológica/química permanecem invisíveis quando não há ocorrência oficial ativa. Se uma fonte oficial vier a alimentar um evento nuclear, a categoria surge automaticamente e o mapa adota o estado visual vermelho; um evento biológico/químico confirmado ativa um estado âmbar. A interface já aplica essas regras, mas nenhum agregador foi habilitado sem um feed oficial global suficientemente confiável.

Alertas do navegador funcionam enquanto o site está aberto. E-mail, Telegram e WhatsApp exigem um serviço externo e credenciais guardadas em GitHub Secrets; nenhuma chave deve ser colocada em `index.html` ou `app.js`.

## Barreira de qualidade

Antes de cada publicação, `node scripts/validate-site.mjs` verifica sintaxe JavaScript, arquivos essenciais, IDs críticos da interface, referências locais, equivalência das traduções, categorias, fontes sensíveis, coordenadas, horários e dimensões das grades ambientais. Uma inconsistência interrompe a publicação do GitHub Pages.

Alterações de código também executam o workflow independente “Validar estabilidade do site”. A validação local pode ser repetida com:

```sh
node scripts/validate-site.mjs
```
