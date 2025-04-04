import express from "express"
import morgan from "morgan"
import { configDotenv } from "dotenv"
import { createProxyMiddleware, responseInterceptor } from "http-proxy-middleware"

configDotenv()

if(process.env.URL?.endsWith("/")) process.env.URL = process.env.URL.substring(0, process.env.URL.length -1)
if(process.env.USERNAME_SELECTOR == null) process.env.USERNAME_SELECTOR = "input[placeholder=Username]"
if(process.env.PASSWORD_SELECTOR == null) process.env.PASSWORD_SELECTOR = "input[placeholder=Password]"
if(process.env.SUBMIT_BUTTON_SELECTOR == null) process.env.SUBMIT_BUTTON_SELECTOR = "button"
if(process.env.NO_LOGIN_CHECK_REGEX == null) process.env.NO_LOGIN_CHECK_REGEX = "api"
if(process.env.WAIT_BEFORE_LOGIN_CHECK == null) process.env.WAIT_BEFORE_LOGIN_CHECK = 1200

let configKeys = [
    "URL",
    "USERNAME",
    "PASSWORD",
    "USERNAME_SELECTOR",
    "PASSWORD_SELECTOR",
    "SUBMIT_BUTTON_SELECTOR",
    "NO_LOGIN_CHECK_REGEX",
    "WAIT_BEFORE_LOGIN_CHECK"
]
let config = {}
configKeys.forEach(key => {
    if(process.env[key] == null) throw Error(`Env: Variable ${key} not set.`)
    config[key] = process.env[key]
})

console.log("Environment:", config)
if(process.env.UNSECURE_MODE?.toLocaleLowerCase() == "true") console.warn(`

######################################################################
#                             DISCLAMER                              #
# Be aware that the username and password are visible to the client. #
#    Set the permissions for the USERNAME as minimal as possible.    #
######################################################################

`)

const app = express()

app.use(morgan("dev"))

app.get("/uoi/client.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript")
    res.send(`
        document.addEventListener("DOMContentLoaded", async () => {
            await new Promise(resolve => {setTimeout(resolve, ${process.env.WAIT_BEFORE_LOGIN_CHECK})})

            let usernameInput = document.querySelector("${process.env.USERNAME_SELECTOR}")
            let passwordInput = document.querySelector("${process.env.PASSWORD_SELECTOR}")
            let submitButton = document.querySelector("${process.env.SUBMIT_BUTTON_SELECTOR}")

            if(usernameInput == null || passwordInput == null || submitButton == null) {
                console.log("[uoi]     No login page detected.")
                return
            }
            
            console.log("[uoi]     Login page detected. Logging in ...")
            usernameInput.value = "${process.env.USERNAME}"
            usernameInput.dispatchEvent(new Event("change"))
            passwordInput.value = "${process.env.PASSWORD}"
            passwordInput.dispatchEvent(new Event("change"))
            submitButton.click()
        })
    `)
})

let wsProxy = createProxyMiddleware({
    target: process.env.URL,
    changeOrigin: true,
    ws: true,
    on: {
        error: (err, req, res) => {
            console.error(err)
            res.status(500)
            res.end(err.message)
        }
    }
})
app.all(new RegExp(process.env.NO_LOGIN_CHECK_REGEX, "gm"), wsProxy)

app.use(
    createProxyMiddleware({
        target: process.env.URL,
        changeOrigin: true,
        selfHandleResponse: true,
        on: {
            proxyRes: responseInterceptor( async (responseBuffer, proxyRes, req, res) => {
                if(proxyRes.headers["content-type"] != "text/html" || req.method.toLowerCase() != "get") return responseBuffer

                let body = responseBuffer.toString("utf-8")
                if(body.substring(0, 15).toLowerCase() != "<!doctype html>") return responseBuffer
                
                res.setHeader("Cache-Control", ["no-cache", "no-store", "must-revalidate"])
                res.setHeader("Pragma", "no-cache")
                res.setHeader("Expires", 0)

                return body.replace("</body>", "<script src=\"/uoi/client.js\" defer></script>\n</body>")
            }),
            error: (err, req, res) => {
                console.error(err)
                res.status(500)
                res.end(err.message)
            }
        }
    })
)

let server = app.listen(80, () => {
    console.log("Server listening on port 80")
})
server.on('upgrade', wsProxy.upgrade)