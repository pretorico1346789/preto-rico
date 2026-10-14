# Preto Rico · Sistema de Gestão

SPA em HTML/CSS/JS puro (GitHub Pages) + Google Apps Script + Google Sheets.

## Arquivos
| Arquivo | Função |
|---|---|
| `index.html` | Shell, menu lateral/inferior, telas e modais |
| `style.css` | Tema preto/dourado (claro/escuro), responsivo e `@media print` para recibos |
| `app.js` | Telas, RBAC, PDV, comissões, curva ABC, conciliação OFX, recibos |
| `api.js` | `fetch` para o Apps Script, chave `k`, cache e fila offline em localStorage |
| `Codigo.gs` | Backend (doGet/doPost) com validação de chave, token de sessão e níveis |
| `logo.png`, `logo-recibo.png` | Logo (o de recibo tem fundo transparente para impressora térmica) |

## Testar sem servidor (modo demonstração)
Abra o `index.html` publicado. Sem servidor configurado, tudo roda e fica salvo no próprio aparelho.
Usuários de demonstração: **Dono Master 1234**, **João Barbeiro 1111**, **Ana Caixa 2222**, **Léo Tattoo 3333**.

## Publicar no GitHub Pages
1. Crie um repositório e envie `index.html`, `style.css`, `app.js`, `api.js`, `logo.png` e `logo-recibo.png` (o `Codigo.gs` não vai para o site).
2. Settings › Pages › Branch `main` / pasta `/root` › Save.

## Ligar à planilha (Google Sheets)
1. Crie uma planilha › Extensões › Apps Script › cole o `Codigo.gs`.
2. Execute `setup()` uma vez e autorize. Ele cria as abas, o usuário **Master / PIN 1234** e a chave **API_SECRET** (aparece em Registros de execução).
3. Implantar › Nova implantação › App da Web › Executar como **Eu** › Acesso **Qualquer pessoa** › copie a URL `/exec`.
4. No sistema: tela de login › **⚙️ Configurar servidor** › cole a URL e a chave › Testar e salvar.
5. Entre como Master e **troque o PIN 1234** em Usuários. Cadastre barbeiros, caixas e tatuadores.

Ao alterar o `Codigo.gs`: Implantar › Gerenciar implantações › Editar › **Nova versão** (a URL não muda).

## Backups
- **Nuvem (automático):** o `setup()` agenda um backup diário às 23h. Uma cópia completa da planilha vai para a pasta **Preto Rico - Backups** no Google Drive da conta dona da planilha. O sistema guarda as últimas 30 cópias. Para reinstalar o agendamento, rode `instalarBackupDiario()`.
- **Computador do caixa (automático):** entre como Master no Chrome ou Edge do computador, abra Configurações › **Ativar e escolher a pasta**. A partir daí, o sistema grava um arquivo `preto-rico-backup-AAAA-MM-DD.json` por dia nessa pasta e guarda os últimos 30. Se o navegador pedir para liberar a pasta de novo, aparece um aviso na tela inicial com o botão **Liberar e salvar backup**.
- **Celulares:** acessam só pela rede, sem backup local. Os dados ficam na planilha.

## Segurança
- Toda chamada exige `k` (API_SECRET). Depois do PIN, o servidor emite um token assinado (12 h) e confere o nível em cada gravação.
- Custos, margem e financeiro não saem do servidor para quem não é Master.
- Desconto abaixo do preço exige o PIN do Master, que gera uma autorização válida por 5 minutos e é conferida no servidor.
- Cinco PINs errados bloqueiam novas tentativas por 10 minutos.
- A chave `k` fica visível no código do site, por isso a proteção real são o PIN, o token e as regras do servidor.

## Abas extras na planilha
Além das 9 abas pedidas, o sistema usa: `Recebimentos` (mensalidades e baixas de fiado), `Conciliacao` (vínculos do OFX) e `Config` (serviços, preços, mensagens). Também acrescenta `Ultimo_Pagamento` em Clientes e `ID_Cliente`/`Nome_Cliente` em Vendas_PDV para o crediário.
