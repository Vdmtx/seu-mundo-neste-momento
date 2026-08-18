# Seu Mundo Neste Momento

Monitor global estático para GitHub Pages. O projeto consulta fontes públicas e mostra a origem, o horário e o estado de cada leitura. Não usa valores aleatórios nem apresenta estimativas inventadas como medições.

## Fontes

- USGS: terremotos acima de magnitude 2,5 nas últimas 24 horas.
- NASA EONET: eventos naturais abertos, como incêndios, tempestades, vulcões e inundações.
- NOAA SWPC: índice Kp, Bz, velocidade do vento solar e previsão OVATION de auroras.
- Where The ISS At: posição, altitude e velocidade da ISS.
- Open-Meteo: clima pontual e camada global aproximada de temperatura.
- GDELT: referências jornalísticas por região. Notícias não equivalem a confirmação independente.
- Windy Webcams: diretório externo de câmeras públicas próximas às coordenadas selecionadas.

## Atualização

O navegador busca terremotos e eventos naturais a cada 5 minutos, ISS a cada 10 segundos, clima espacial a cada 5 minutos e temperatura global a cada 30 minutos quando a camada está ativada. O GitHub Actions gera um snapshot de contingência e republica o GitHub Pages a cada 15 minutos, sem criar commits automáticos no histórico.

## Limites reais

GitHub Pages não executa servidor. APIs podem aplicar limites, bloquear CORS ou ficar temporariamente fora do ar. O painel mostra essas falhas. Câmeras de guerras e desastres não podem ser garantidas: o projeto apenas aponta para câmeras públicas catalogadas, sem afirmar que mostram o evento.
