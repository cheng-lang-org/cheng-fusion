// api_helper.c — Provides JSON body and headers for DeepSeek API call
// Compiled to .o and linked with Cheng binary

const char* deepseek_api_url(void) {
    return "https://api.deepseek.com/anthropic/v1/messages";
}

const char* deepseek_json_body(void) {
    return "{"
           "\"model\":\"deepseek-chat\","
           "\"max_tokens\":1024,"
           "\"messages\":["
           "{\"role\":\"user\",\"content\":\"Hello from Cheng native binary\"}"
           "]"
           "}";
}

const char* deepseek_headers(void) {
    return "x-api-key: sk-d929635ee9cd426496d4ec30334a9e8b\r\n"
           "anthropic-version: 2023-06-01\r\n"
           "Content-Type: application/json";
}
