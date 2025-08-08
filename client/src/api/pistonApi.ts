import axios, { AxiosInstance } from "axios"

const pistonBaseUrl = "https://emkc.org/api/v2/piston"

const instance: AxiosInstance = axios.create({
    baseURL: pistonBaseUrl,
    headers: {
        "Content-Type": "application/json",
    },
})

export default instance

// 1. Import the axios library and the AxiosInstance type from the axios module
// 2. Define the base URL for the Piston API
// 3. Create a custom axios object with:
//     a. The base URL set to the Piston API URL
//     b. Default headers where Content-Type is set to JSON
// 4. Export this custom axios object so it can be reused for making HTTP requests
