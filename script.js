const folderInput = document.getElementById("folderInput");
const fileSummary = document.getElementById("fileSummary");
const processButton = document.getElementById("processButton");
const widthInput = document.getElementById("widthInput");
const heightInput = document.getElementById("heightInput");
const statusText = document.getElementById("statusText");
const progressWrapper = document.getElementById("progressWrapper");
const progressBar = document.getElementById("progressBar");
const downloadLink = document.getElementById("downloadLink");

let selectedFiles = [];

// Quando o usuário seleciona a pasta
folderInput.addEventListener("change", () => {
  const files = Array.from(folderInput.files || []);
  const imageFiles = files.filter((f) => f.type.startsWith("image/"));

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

  statusText.textContent = "";
  progressWrapper.style.display = "none";
  progressBar.style.width = "0%";
  downloadLink.style.display = "none";
});

// Função para redimensionar uma imagem usando <canvas>
function resizeImage(file, targetWidth, targetHeight) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");

        // fundo branco
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        const scale = Math.min(
          targetWidth / img.width,
          targetHeight / img.height
        );

        const newWidth = Math.round(img.width * scale);
        const newHeight = Math.round(img.height * scale);

        const offsetX = Math.round((targetWidth - newWidth) / 2);
        const offsetY = Math.round((targetHeight - newHeight) / 2);

        ctx.drawImage(img, offsetX, offsetY, newWidth, newHeight);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Falha ao gerar blob da imagem."));
            } else {
              resolve(blob);
            }
          },
          "image/jpeg",
          0.92
        );
      };
      img.onerror = () => reject(new Error("Erro ao carregar imagem."));
      img.src = event.target.result;
    };

    reader.onerror = () => reject(new Error("Erro ao ler arquivo de imagem."));
    reader.readAsDataURL(file);
  });
}

// Clique no botão de processar
processButton.addEventListener("click", async () => {
  if (!selectedFiles.length) return;

  const targetWidth = parseInt(widthInput.value, 10) || 1280;
  const targetHeight = parseInt(heightInput.value, 10) || 900;

  processButton.disabled = true;
  folderInput.disabled = true;
  statusText.textContent = "Iniciando processamento...";
  progressWrapper.style.display = "block";
  progressBar.style.width = "0%";
  downloadLink.style.display = "none";

  const zip = new JSZip();

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

      const newFileName = baseName + "_redimensionada.jpg";
      const zipPath = folderPath
        ? folderPath + "/" + newFileName
        : newFileName;

      statusText.textContent = `Processando ${i + 1} de ${total}: ${relPath}`;

      const resizedBlob = await resizeImage(
        file,
        targetWidth,
        targetHeight
      );

      zip.file(zipPath, resizedBlob);

      const progress = Math.round(((i + 1) / total) * 100);
      progressBar.style.width = progress + "%";
    }

    statusText.textContent = "Gerando arquivo ZIP...";
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const zipName = `imagens_ajustadas_${yyyy}${mm}${dd}.zip`;

    const url = URL.createObjectURL(zipBlob);
    downloadLink.href = url;
    downloadLink.download = zipName;
    downloadLink.textContent = `Baixar ${zipName}`;
    downloadLink.style.display = "inline-block";

    statusText.textContent = "Concluído! Baixe o arquivo ZIP abaixo.";
  } catch (err) {
    console.error(err);
    statusText.textContent = "Erro durante o processamento: " + err.message;
  } finally {
    processButton.disabled = false;
    folderInput.disabled = false;
  }
});
