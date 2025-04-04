import express from "express"
import morgan from "morgan"
import { configDotenv } from "dotenv"
import { createProxyMiddleware, responseInterceptor } from "http-proxy-middleware"
import {auth} from "express-openid-connect"

configDotenv()

if(process.env.URL?.endsWith("/")) process.env.URL = process.env.URL.substring(0, process.env.URL.length -1)
if(process.env.USERNAME_SELECTOR == null) process.env.USERNAME_SELECTOR = "input[placeholder=Username]"
if(process.env.PASSWORD_SELECTOR == null) process.env.PASSWORD_SELECTOR = "input[placeholder=Password]"
if(process.env.SUBMIT_BUTTON_SELECTOR == null) process.env.SUBMIT_BUTTON_SELECTOR = "button"
if(process.env.NO_LOGIN_CHECK_REGEX == null) process.env.NO_LOGIN_CHECK_REGEX = "api"
if(process.env.LOGIN_CHECK_DELAY == null) process.env.LOGIN_CHECK_DELAY = 1200
if(process.env.LOGIN_CHECK_INTERVAL == null) process.env.LOGIN_CHECK_INTERVAL = -1
if(process.env.OIDC_BASE_URL == null)  process.env.OIDC_BASE_URL = "http://localhost"
process.env.DEV_SKIP_AUTH = process.env.DEV_SKIP_AUTH?.toLocaleLowerCase() == "true"

let configKeys = [
    "URL",
    "USERNAME",
    "PASSWORD",
    "USERNAME_SELECTOR",
    "PASSWORD_SELECTOR",
    "SUBMIT_BUTTON_SELECTOR",
    "NO_LOGIN_CHECK_REGEX",
    "LOGIN_CHECK_DELAY",
    "LOGIN_CHECK_INTERVAL",
    "OIDC_ISSUER_URL",
    "OIDC_BASE_URL",
    "OIDC_CLIENT_ID",
    "OIDC_CLIENT_SECRET",
    "DEV_SKIP_AUTH"
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

if(process.env.DEV_SKIP_AUTH != "true") {
    app.use(
        auth({
            issuerBaseURL: process.env.OIDC_ISSUER_URL,
            baseURL: process.env.OIDC_BASE_URL,
            clientID: process.env.OIDC_CLIENT_ID,
            secret: process.env.OIDC_CLIENT_SECRET,
            idpLogout: true
        })
    )
}

app.get("/uoi/client.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript")
    res.send(`
        let loginCheckInterval = ${process.env.LOGIN_CHECK_INTERVAL}
        let loginCheckDelay = ${process.env.LOGIN_CHECK_DELAY}

        document.addEventListener("DOMContentLoaded", () => {
            setTimeout(loginCheck, loginCheckDelay)

            if(loginCheckInterval < 0) return
            setInterval(loginCheck, loginCheckInterval)
        })

        function loginCheck() {
            let usernameInput = document.querySelector("${process.env.USERNAME_SELECTOR.replace(/"/g, "'")}")
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
        }
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
// app.all(new RegExp(process.env.NO_LOGIN_CHECK_REGEX, "gm"), wsProxy)

app.use(
    createProxyMiddleware({
        target: process.env.URL,
        changeOrigin: true,
        selfHandleResponse: true,
        on: {
            proxyRes: responseInterceptor( async (responseBuffer, proxyRes, req, res) => {
                if(!proxyRes.headers["content-type"].includes("text/html") || req.method.toLowerCase() != "get") return responseBuffer

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