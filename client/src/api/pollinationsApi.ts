import axios, { AxiosInstance } from "axios"

const pollinationsBaseUrl = "https://text.pollinations.ai"

const instance: AxiosInstance = axios.create({
    baseURL: pollinationsBaseUrl,
    headers: {
        "Content-Type": "application/json",
    },
})

export default instance


// 1. Import axios and AxiosInstance type
// 2. Define the base URL for Pollinations API
// 3. Create an axios client with:
//    a. Base URL set to pollinations
//    b. JSON content type header
// 4. Export this axios client for global use

