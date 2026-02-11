import "dotenv/config";
import http from "node:http";

const port = process.env.PORT || 8788;
const url = `http://localhost:${port}/api/generate-json`;

console.log(`Triggering JSON regeneration at ${url}...`);

const req = http.request(url, {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    }
}, (res) => {
    let data = "";
    res.on("data", (chunk) => data += chunk);
    res.on("end", () => {
        if (res.statusCode === 200) {
            const result = JSON.parse(data);
            console.log("Success!");
            console.log("Output Directory:", result.outputDir);
            console.log("Files generated:", result.files.length);
        } else {
            console.error("Failed with status:", res.statusCode);
            console.error(data);
        }
    });
});

req.on("error", (error) => {
    console.error("Connection error:", error.message);
});

req.write(JSON.stringify({})); // Empty body generates all
req.end();
