const folderInput = document.getElementById("folderInput");
const fileSummary = document.getElementById("fileSummary");
const processButton = document.getElementById("processButton");
const widthInput = document.getElementById("widthInput");
const heightInput = document.getElementById("heightInput");
const statusText = document.getElementById("statusText");
const progressWrapper = document.getElementById("progressWrapper");
const progressBar = document.getElementById("progressBar");
const downloadLink = document.getElementById("downloadLink");
const reportBox = document.getElementById("reportBox");

// Extensões aceitas mesmo quando o sistema não informa o tipo MIME
// (o navegador deixa f.type vazio para extensões que o SO não reconhece)
const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "jpe", "jfif", "pjpeg", "pjp",
  "png", "gif", "webp", "bmp", "avif", "ico", "svg",
  "heic", "heif",
  "tif", "tiff",
]);
const HEIC_EXTENSIONS = new Set(["heic", "heif"]);

// Arquivos de sistema que não vale a pena listar como "ignorados"
const SYSTEM_FILES = new Set(["thumbs.db", "desktop.ini", ".ds_store"]);

const HEIC2ANY_URL =
  "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";

let selectedFiles = [];
let currentDownloadUrl = null;

function getExtension(name) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex === -1 ? "" : name.substring(dotIndex + 1).toLowerCase();
}

function isImageFile(file) {
  return (
    file.type.startsWith("image/") || IMAGE_EXTENSIONS.has(getExtension(file.name))
  );
}

function isHeic(file) {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    HEIC_EXTENSIONS.has(getExtension(file.name))
  );
}

function isSystemFile(file) {
  const name = file.name.toLowerCase();
  return SYSTEM_FILES.has(name) || name.startsWith("._");
}

// Agrupa arquivos por extensão: "12 .mp4, 3 .cr2"
function describeByExtension(files) {
  const counts = new Map();
  for (const f of files) {
    const ext = getExtension(f.name);
    const key = ext ? "." + ext : "(sem extensão)";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([ext, n]) => `${n} ${ext}`)
    .join(", ");
}

function showReport(lines) {
  reportBox.innerHTML = "";
  if (!lines.length) {
    reportBox.style.display = "none";
    return;
  }
  for (const line of lines) {
    const p = document.createElement("p");
    p.textContent = line;
    reportBox.appendChild(p);
  }
  reportBox.style.display = "block";
}

// Quando o usuário seleciona a pasta
folderInput.addEventListener("change", () => {
  const files = Array.from(folderInput.files || []).filter(
    (f) => !isSystemFile(f)
  );
  const imageFiles = files.filter(isImageFile);
  const ignoredFiles = files.filter((f) => !isImageFile(f));

  selectedFiles = imageFiles;

  if (imageFiles.length === 0) {
    fileSummary.textContent = "Nenhuma imagem selecionada.";
    processButton.disabled = true;
  } else {
    const folderCount = new Set(
      imageFiles
        .map((f) => f.webkitRelativePath || f.name)
        .map((path) => {
          const parts = path.split("/");
          parts.pop(); // remove o nome do arquivo
          return parts.join("/") || "(raiz)";
        })
    ).size;

    fileSummary.textContent = `${imageFiles.length} imagem(ns) em ${folderCount} pasta(s).`;
    processButton.disabled = false;
  }

  showReport(
    ignoredFiles.length
      ? [
          `${ignoredFiles.length} arquivo(s) ignorado(s) por não serem imagens: ${describeByExtension(ignoredFiles)}.`,
        ]
      : []
  );

  statusText.textContent = "";
  progressWrapper.style.display = "none";
  progressBar.style.width = "0%";
  downloadLink.style.display = "none";
});

// Carrega a biblioteca de conversão HEIC só quando necessário
let heic2anyPromise = null;
function loadHeic2any() {
  if (!heic2anyPromise) {
    heic2anyPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = HEIC2ANY_URL;
      script.onload = () => resolve(window.heic2any);
      script.onerror = () => {
        heic2anyPromise = null;
        reject(new Error("Não foi possível carregar o conversor HEIC."));
      };
      document.head.appendChild(script);
    });
  }
  return heic2anyPromise;
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("formato não suportado pelo navegador ou arquivo corrompido"));
    };
    img.src = url;
  });
}

// Redimensiona uma imagem usando <canvas>
// mode "cover": preenche o quadro e corta o excesso (centralizado)
// mode "contain": mostra a foto inteira, com faixas brancas
async function resizeImage(file, targetWidth, targetHeight, mode) {
  let source = file;

  if (isHeic(file)) {
    const heic2any = await loadHeic2any();
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.95 });
    source = Array.isArray(converted) ? converted[0] : converted;
  }

  const img = await loadImage(source);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");

  // fundo branco
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const scaleX = targetWidth / img.width;
  const scaleY = targetHeight / img.height;
  const scale = mode === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

  const newWidth = Math.round(img.width * scale);
  const newHeight = Math.round(img.height * scale);

  const offsetX = Math.round((targetWidth - newWidth) / 2);
  const offsetY = Math.round((targetHeight - newHeight) / 2);

  ctx.drawImage(img, offsetX, offsetY, newWidth, newHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("falha ao gerar a imagem redimensionada"));
        } else {
          resolve(blob);
        }
      },
      "image/jpeg",
      0.92
    );
  });
}

function setModeInputsDisabled(disabled) {
  document
    .querySelectorAll('input[name="resizeMode"]')
    .forEach((input) => (input.disabled = disabled));
}

// Garante um nome único no ZIP (ex.: foto.jpg e foto.png na mesma pasta)
function uniqueZipPath(folderPath, baseName, usedPaths) {
  const prefix = folderPath ? folderPath + "/" : "";
  let candidate = `${prefix}${baseName}_redimensionada.jpg`;
  let counter = 2;
  while (usedPaths.has(candidate.toLowerCase())) {
    candidate = `${prefix}${baseName}_redimensionada_${counter}.jpg`;
    counter++;
  }
  usedPaths.add(candidate.toLowerCase());
  return candidate;
}

// Clique no botão de processar
processButton.addEventListener("click", async () => {
  if (!selectedFiles.length) return;

  const targetWidth = parseInt(widthInput.value, 10) || 1280;
  const targetHeight = parseInt(heightInput.value, 10) || 900;
  const mode = document.querySelector('input[name="resizeMode"]:checked').value;

  processButton.disabled = true;
  folderInput.disabled = true;
  setModeInputsDisabled(true);
  statusText.textContent = "Iniciando processamento...";
  progressWrapper.style.display = "block";
  progressBar.style.width = "0%";
  downloadLink.style.display = "none";

  const zip = new JSZip();
  const usedPaths = new Set();
  const failures = [];
  let successCount = 0;

  try {
    const total = selectedFiles.length;

    for (let i = 0; i < total; i++) {
      const file = selectedFiles[i];
      const relPath = file.webkitRelativePath || file.name;

      // extrai diretório relativo e nome do arquivo
      const parts = relPath.split("/");
      const originalFileName = parts.pop(); // nome do arquivo
      const folderPath = parts.join("/"); // pode ser "" (raiz)

      const dotIndex = originalFileName.lastIndexOf(".");
      const baseName =
        dotIndex === -1
          ? originalFileName
          : originalFileName.substring(0, dotIndex);

      statusText.textContent = `Processando ${i + 1} de ${total}: ${relPath}`;

      // Uma imagem com problema não interrompe o lote inteiro
      try {
        const resizedBlob = await resizeImage(file, targetWidth, targetHeight, mode);
        zip.file(uniqueZipPath(folderPath, baseName, usedPaths), resizedBlob);
        successCount++;
      } catch (err) {
        console.error(relPath, err);
        failures.push(`${relPath}: ${err.message}`);
      }

      const progress = Math.round(((i + 1) / total) * 100);
      progressBar.style.width = progress + "%";
    }

    if (successCount === 0) {
      statusText.textContent = "Nenhuma imagem pôde ser processada.";
      showReport(["Falhas:", ...failures]);
      return;
    }

    statusText.textContent = "Gerando arquivo ZIP...";
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const zipName = `imagens_ajustadas_${yyyy}${mm}${dd}.zip`;

    if (currentDownloadUrl) URL.revokeObjectURL(currentDownloadUrl);
    currentDownloadUrl = URL.createObjectURL(zipBlob);
    downloadLink.href = currentDownloadUrl;
    downloadLink.download = zipName;
    downloadLink.textContent = `Baixar ${zipName}`;
    downloadLink.style.display = "inline-block";

    statusText.textContent = failures.length
      ? `Concluído: ${successCount} de ${total} imagem(ns) no ZIP. ${failures.length} falharam (veja abaixo).`
      : `Concluído! ${successCount} imagem(ns) no ZIP. Baixe o arquivo abaixo.`;
    showReport(failures.length ? ["Imagens que não puderam ser processadas:", ...failures] : []);
  } catch (err) {
    console.error(err);
    statusText.textContent = "Erro durante o processamento: " + err.message;
  } finally {
    processButton.disabled = false;
    folderInput.disabled = false;
    setModeInputsDisabled(false);
  }
});
