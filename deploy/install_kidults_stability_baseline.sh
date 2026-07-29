#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/opt/intelligence-holdings/kidults/app"
LOG_ROOT="/opt/intelligence-holdings/kidults/logs"

if [ ! -d "${APP_ROOT}" ]; then
  echo "Missing application directory: ${APP_ROOT}" >&2
  exit 1
fi

mkdir -p "${LOG_ROOT}"
chown kaios:kaios "${LOG_ROOT}"
chmod 750 "${LOG_ROOT}"

install -m 0755 \
  "${APP_ROOT}/scripts/stability_snapshot.py" \
  /usr/local/bin/kidults-stability-snapshot

install -m 0755 \
  "${APP_ROOT}/scripts/stability_report.py" \
  /usr/local/bin/kidults-stability-report

cat > /etc/systemd/system/kidults-stability-snapshot.service <<'EOF'
[Unit]
Description=Kidults hourly production stability snapshot
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target
ConditionPathExists=/opt/intelligence-holdings/kidults/data/kaios.db
ConditionPathIsMountPoint=/mnt/ih_prod_01

[Service]
Type=oneshot
User=root
Group=root
WorkingDirectory=/opt/intelligence-holdings/kidults/app
ExecStart=/usr/bin/python3 /usr/local/bin/kidults-stability-snapshot
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
ReadWritePaths=/opt/intelligence-holdings/kidults/logs
EOF

cat > /etc/systemd/system/kidults-stability-snapshot.timer <<'EOF'
[Unit]
Description=Run Kidults production stability snapshot hourly

[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=180
Unit=kidults-stability-snapshot.service

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/kidults-stability-daily.service <<'EOF'
[Unit]
Description=Generate Kidults daily stability report
After=kidults-stability-snapshot.service

[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/bin/python3 /usr/local/bin/kidults-stability-report --hours 24 --output /opt/intelligence-holdings/kidults/logs/stability-daily.json
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
ReadWritePaths=/opt/intelligence-holdings/kidults/logs
EOF

cat > /etc/systemd/system/kidults-stability-daily.timer <<'EOF'
[Unit]
Description=Generate Kidults daily stability report at 00:20 KST

[Timer]
OnCalendar=*-*-* 00:20:00 Asia/Seoul
Persistent=true
RandomizedDelaySec=120
Unit=kidults-stability-daily.service

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/kidults-stability-weekly.service <<'EOF'
[Unit]
Description=Generate Kidults seven-day stability report
After=kidults-stability-snapshot.service

[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/bin/python3 /usr/local/bin/kidults-stability-report --hours 168 --output /opt/intelligence-holdings/kidults/logs/stability-7d.json
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
ReadWritePaths=/opt/intelligence-holdings/kidults/logs
EOF

cat > /etc/systemd/system/kidults-stability-weekly.timer <<'EOF'
[Unit]
Description=Generate Kidults seven-day stability report every Monday

[Timer]
OnCalendar=Mon *-*-* 00:35:00 Asia/Seoul
Persistent=true
RandomizedDelaySec=120
Unit=kidults-stability-weekly.service

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/kidults-stability-30d.service <<'EOF'
[Unit]
Description=Generate Kidults thirty-day stability report
After=kidults-stability-snapshot.service

[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/bin/python3 /usr/local/bin/kidults-stability-report --hours 720 --output /opt/intelligence-holdings/kidults/logs/stability-30d.json
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
ReadWritePaths=/opt/intelligence-holdings/kidults/logs
EOF

cat > /etc/systemd/system/kidults-stability-30d.timer <<'EOF'
[Unit]
Description=Refresh Kidults rolling thirty-day stability report daily

[Timer]
OnCalendar=*-*-* 00:45:00 Asia/Seoul
Persistent=true
RandomizedDelaySec=120
Unit=kidults-stability-30d.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now \
  kidults-stability-snapshot.timer \
  kidults-stability-daily.timer \
  kidults-stability-weekly.timer \
  kidults-stability-30d.timer

systemctl start kidults-stability-snapshot.service
systemctl start kidults-stability-daily.service

echo "Kidults stability baseline installed."
systemctl list-timers 'kidults-stability-*' --all
