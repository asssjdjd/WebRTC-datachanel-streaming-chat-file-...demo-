# --- Giai đoạn 1: Build ---
# Sử dụng Node.js phiên bản 20-alpine làm base image để build
FROM node:20-alpine AS builder

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Cài đặt pnpm (dựa trên cấu trúc thư mục node_modules của bạn)
RUN npm install -g pnpm

# Sao chép package.json và pnpm-lock.yaml vào thư mục làm việc
COPY package.json pnpm-lock.yaml ./

# Cài đặt toàn bộ dependencies (bao gồm cả devDependencies để build)
RUN pnpm install --frozen-lockfile

# Sao chép toàn bộ mã nguồn của project vào
COPY . .

# Build project TypeScript thành JavaScript
# Lệnh này giả định bạn có một script "build" trong package.json, ví dụ: "build": "tsc"
RUN pnpm build

# --- Giai đoạn 2: Production ---
# Sử dụng cùng một base image gọn nhẹ cho môi trường production
FROM node:20-alpine

# Thiết lập thư mục làm việc
WORKDIR /app

# Cài đặt pnpm
RUN npm install -g pnpm

# Sao chép package.json và pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Chỉ cài đặt các dependencies cần thiết cho production để giảm kích thước image
RUN pnpm install --prod --frozen-lockfile

# Sao chép các file đã được build từ giai đoạn "builder"
# Giả sử thư mục output của bạn là "dist"
COPY --from=builder /app/dist ./dist

# Mở port 8080 để bên ngoài có thể truy cập vào signaling server
EXPOSE 7727

# Lệnh để khởi chạy ứng dụng khi container bắt đầu
CMD ["node", "dist/index.js"]
