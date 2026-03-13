process.on("uncaughtException", err => console.log("⚠️ Error:", err))
process.on("unhandledRejection", err => console.log("⚠️ Rejection:", err))

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys")
const qrcode = require("qrcode-terminal")
const P = require("pino")
const fs = require("fs")
const path = require("path")
const os = require("os")
const yts = require("youtube-yts")
const YTDlpWrap = require("yt-dlp-wrap").default

const ytDlp = new YTDlpWrap(path.join(__dirname, "yt-dlp.exe"))

let antilink = {}
let warnings = {}

async function downloadAudio(videoUrl) {
  const tmpFile = path.join(os.tmpdir(), `audio_${Date.now()}`)
  const tmpMp3 = tmpFile + ".mp3"

  await ytDlp.execPromise([
    videoUrl,
    "--extractor-args", "youtube:player_client=tv_embedded",
    "--ffmpeg-location", __dirname,
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "--no-check-certificates",
    "--no-playlist",
    "-o", tmpFile + ".%(ext)s"
  ])

  const buffer = fs.readFileSync(tmpMp3)
  try { fs.unlinkSync(tmpMp3) } catch(_){}
  return buffer
}

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("session")
const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
version,
logger: P({ level:"silent" }),
auth: state
})

sock.ev.on("creds.update", saveCreds)

sock.ev.on("connection.update", ({ connection, qr }) => {
if(qr){
console.log("📱 ESCANEA EL QR")
qrcode.generate(qr,{small:true})
}
if(connection === "open") console.log("✅ KIMITLET BOT CONECTADO")
if(connection === "close"){
console.log("🔄 Reconectando...")
startBot()
}
})

sock.ev.on("group-participants.update", async (data) => {
const metadata = await sock.groupMetadata(data.id)
for(let user of data.participants){
let id = typeof user === "string" ? user : user.id || user
if(data.action === "add"){
await sock.sendMessage(data.id,{
image:{url:"https://i.imgur.com/8Km9tLL.jpeg"},
caption:`🎉 Bienvenido @${id.split("@")[0]} a *${metadata.subject}*`,
mentions:[id]
})
}
if(data.action === "remove"){
await sock.sendMessage(data.id,{
text:`👋 @${id.split("@")[0]} salió del grupo`,
mentions:[id]
})
}
}
})

sock.ev.on("messages.upsert", async ({ messages }) => {

const m = messages[0]
if(!m.message) return

const from = m.key.remoteJid
const sender = m.key.participant || from

const body =
  m.message.conversation ||
  m.message.extendedTextMessage?.text ||
  ""

const command = body.split(" ")[0].toLowerCase()
const args = body.split(" ").slice(1)
const isGroup = from.endsWith("@g.us")

if(command === ".menu"){
const menu = `
╭━━〔 🤖 *KIMITLET BOT* 〕━━⬣

👑 ADMIN
▢ .kick @usuario
▢ .tag
▢ .open
▢ .close
▢ .antilink on/off

🎵 MUSICA
▢ .play nombre canción

⚙ UTILIDAD
▢ .ping

╰━━━━━━━━━━━━⬣
`
sock.sendMessage(from,{text:menu})
}

if(command === ".ping"){
sock.sendMessage(from,{text:"🏓 Pong! Bot activo"})
}

if(command === ".tag" && isGroup){
const group = await sock.groupMetadata(from)
let text = "📢 MENCIONANDO A TODOS\n\n"
let mentions = []
for(let p of group.participants){
mentions.push(p.id)
text += `@${p.id.split("@")[0]}\n`
}
sock.sendMessage(from,{text,mentions})
}

if(command === ".open"){
await sock.groupSettingUpdate(from,"not_announcement")
sock.sendMessage(from,{text:"🔓 Grupo abierto"})
}

if(command === ".close"){
await sock.groupSettingUpdate(from,"announcement")
sock.sendMessage(from,{text:"🔒 Grupo cerrado"})
}

if(command === ".antilink"){
if(args[0] === "on"){
antilink[from] = true
sock.sendMessage(from,{text:"🚫 Antilink activado"})
}
if(args[0] === "off"){
antilink[from] = false
sock.sendMessage(from,{text:"✅ Antilink desactivado"})
}
}

const linkRegex = /(https?:\/\/|chat\.whatsapp\.com|wa\.me)/gi
if(antilink[from] && linkRegex.test(body)){
warnings[sender] = (warnings[sender] || 0) + 1
await sock.sendMessage(from,{
text:`⚠️ @${sender.split("@")[0]} los links no están permitidos\nAdvertencia ${warnings[sender]}/3`,
mentions:[sender]
})
await sock.sendMessage(from,{delete:m.key})
if(warnings[sender] >= 3){
await sock.groupParticipantsUpdate(from,[sender],"remove")
sock.sendMessage(from,{text:"🚫 Usuario expulsado por enviar links"})
}
}

if(command === ".kick"){
const mention = m.message.extendedTextMessage?.contextInfo?.mentionedJid
if(!mention) return sock.sendMessage(from,{text:"Menciona a alguien"})
await sock.groupParticipantsUpdate(from,mention,"remove")
sock.sendMessage(from,{text:"👢 Usuario eliminado"})
}

if(command === ".play"){

if(!args.length) return sock.sendMessage(from,{text:"🎵 Escribe el nombre de la canción\nEjemplo: .play bad bunny"})

try{
const query = args.join(" ")
await sock.sendMessage(from,{text:"🔎 Buscando canción..."})

const search = await yts(query)
const video = search.videos[0]

if(!video) return sock.sendMessage(from,{text:"❌ No encontré la canción"})

await sock.sendMessage(from,{
text:`🎵 *${video.title}*\n⏱ ${video.timestamp}\n📺 ${video.author.name}\n\n_Descargando..._`
})

const audioBuffer = await downloadAudio(video.url)

await sock.sendMessage(from,{
audio: audioBuffer,
mimetype: "audio/mpeg",
ptt: false
})

}catch(e){
console.log(e)
sock.sendMessage(from,{text:"❌ No pude descargar esa canción"})
}

}

})

}

startBot()
