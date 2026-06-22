FROM php:8.2-cli

WORKDIR /app
COPY . /app

# Railway injeta a porta em $PORT; cai pra 8080 no local.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "php -S 0.0.0.0:${PORT} -t /app /app/router.php"]
