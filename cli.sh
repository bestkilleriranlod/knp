#!/bin/bash

case "$1" in
    start)
        cd /root/knp && docker compose up -d
        ;;
    stop)
        cd /root/knp && docker compose down
        ;;
    restart)
        cd /root/knp && docker compose down && docker compose up -d
        ;;
    logs)
        case "$2" in
            frontend)
                cd /root/knp && docker logs -f knp-frontend --tail 100
                ;;
            backend)
                cd /root/knp && docker logs -f knp-backend --tail 100
                ;;
            sync)
                cd /root/knp && docker exec -it knp-backend pm2 logs sync
                ;;
            *)
                cd /root/knp && docker logs -f knp-backend --tail 100
                ;;
        esac
        ;;
    update)
        cd /root/knp && git checkout -- cli.sh && git pull && chmod +x cli.sh && docker image prune -f && docker system prune -f && docker compose build --no-cache && docker compose down && docker compose up -d
        ;;
    update-frontend)
        cd /root/knp && docker compose down knp-frontend && docker image rm knp-knp-frontend && docker compose build --no-cache knp-frontend && docker compose up -d knp-frontend
        echo "Frontend has been rebuilt and restarted"
        ;;
    *)
        echo "Usage: knp {start|stop|restart|logs|update|update-frontend}" 
        echo "For logs: knp logs {frontend|backend|sync}"
        exit 1
        ;;
esac
