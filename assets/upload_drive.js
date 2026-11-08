const fs = require('fs');
const https = require('https');
const path = require('path');

const token = process.env.GCLI_ACCESS_TOKEN;
if (!token) {
  console.error("No GCLI_ACCESS_TOKEN found in environment.");
  process.exit(1);
}

const filePath = process.argv[2] || "c:\\Users\\Zanh\\Downloads\\ma-de-421.pdf";
const folderId = process.argv[3] || "1Qd75nHk5Da8V7GVUCDNO2TzhDGk_AolN";
const fileName = path.basename(filePath);

console.log(`Uploading ${fileName} to folder ${folderId}...`);

const fileData = fs.readFileSync(filePath);
const boundary = "-------314159265358979323846";
const delimiter = "\r\n--" + boundary + "\r\n";
const closeDelim = "\r\n--" + boundary + "--";

const metadata = {
  name: fileName,
  parents: [folderId]
};

const multipartRequestBody = Buffer.concat([
  Buffer.from(
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/pdf\r\n\r\n'
  ),
  fileData,
  Buffer.from(closeDelim)
]);

const req = https.request({
  hostname: 'www.googleapis.com',
  port: 443,
  path: '/upload/drive/v3/files?uploadType=multipart',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': `multipart/related; boundary=${boundary}`,
    'Content-Length': multipartRequestBody.length
  }
}, (res) => {
  let responseData = '';
  res.on('data', chunk => responseData += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(responseData);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log("Upload SUCCESS! File ID:", json.id);
        const fileId = json.id;
        
        // Make public
        const permReq = https.request({
          hostname: 'www.googleapis.com',
          port: 443,
          path: `/drive/v3/files/${fileId}/permissions`,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }, (pRes) => {
          let pData = '';
          pRes.on('data', c => pData += c);
          pRes.on('end', () => {
            console.log("Permission response:", pRes.statusCode);
            console.log("SHARE_LINK: https://drive.google.com/file/d/" + fileId + "/view?usp=drive_link");
          });
        });
        permReq.write(JSON.stringify({ role: 'reader', type: 'anyone' }));
        permReq.end();
      } else {
        console.error("Upload FAILED:", res.statusCode, responseData);
      }
    } catch (e) {
      console.error("Parse error:", e, responseData);
    }
  });
});

req.on('error', (e) => {
  console.error("Request error:", e);
});

req.write(multipartRequestBody);
req.end();
