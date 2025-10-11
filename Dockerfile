# Sử dụng một image nginx gọn nhẹ làm nền tảng
FROM nginx:1.25-alpine

# Đặt thư mục làm việc bên trong container
WORKDIR /usr/share/nginx/html

# Xóa các tệp mặc định của nginx
RUN rm -rf ./*

# Sao chép các tệp tĩnh của dự án vào thư mục web root của nginx
COPY ./index.html .
COPY ./css ./css
COPY ./js ./js

# Mở cổng 80 để có thể truy cập web server từ bên ngoài
EXPOSE 7227

# Lệnh mặc định của image nginx là `nginx -g 'daemon off;'` sẽ tự động chạy khi container khởi động.