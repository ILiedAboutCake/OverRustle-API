OverRustle-API
==========
Track viewer counts with socket.io

Main website: https://github.com/ILiedAboutCake/OverRustle

#Installing

## Server Dependencies
* NPM >= 1.4.28
* Node >= 0.10.35
* Nginx >= 1.6.2
* Redis >= 2.8.17

## Node Dependencies
* express >= 4.10.2
* jsonfile >= 2.0.0
* redis >= 0.12.1
* request >= 2.49.0
* socket.io >= 1.2.0

##Nginx reverse-proxy
```
proxy_cache_path  /data/nginx/cache  levels=1:2    keys_zone=STATIC:10m inactive=24h  max_size=32m;

upstream node {
    server localhost:9998;
}

server {
    listen *:80;
    listen [::]:80;
    server_name api.overrustle.com;

    #required to let admin commands work
    underscores_in_headers on;
    ignore_invalid_headers off;

    error_log   /var/log/nginx/api.err;
    access_log  off;

    location / {
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $http_host;

        proxy_pass http://node/;
        proxy_redirect off;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_cache STATIC;
        proxy_cache_valid 200 1m;
        proxy_cache_bypass $http_upgrade;
        proxy_cache_use_stale  error timeout invalid_header updating http_500 http_502 http_503 http_504;
    }

    location ~* ^.+\.(jpg|jpeg|gif|png|ico|css|txt|html)$ {
        root   /srv/OverRustle-API;
    }

    add_header X-XSS-Protection "1; mode=block";
}
```
