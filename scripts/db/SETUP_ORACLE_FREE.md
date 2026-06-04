# Oracle Free Tier — FleetCrown Postgres host setup

Oracle Cloud's Always Free tier gives you 4 ARM cores + 24 GB RAM + 200 GB storage at no cost, forever. The catch: the UI is a maze, ARM means you may need to rebuild some images, and Oracle has been known to reclaim idle instances. For "always-free production" it's still the most generous deal on the internet — if you can stomach the setup.

If you're impatient or unsure, use Hetzner instead (see SETUP_HETZNER.md).

## 0. Prereqs

- Oracle Cloud account with Free Tier enrollment
- SSH key locally
- `pg_dump` available locally

## 1. Provision the VM

Console → Menu → Compute → Instances → Create Instance:

- Name: `fleetcrown-db`
- Image: Canonical Ubuntu 24.04
- Shape: change → "Ampere" tab → VM.Standard.A1.Flex — set 2 OCPU, 12 GB memory (half the free quota; leaves room for a second instance)
- Networking: Create new VCN if you don't have one; assign public IPv4
- SSH keys: paste your public key
- Boot volume: 100 GB (free tier total is 200 GB so this leaves 100 for a future instance)

Hit Create. Provisioning takes ~2 min. Note the public IPv4.

## 2. Open port 5432 to the internet (security list)

Console → Networking → Virtual Cloud Networks → click your VCN → Security Lists → Default → Add Ingress Rules:

- Source CIDR: `0.0.0.0/0` (or Vercel's egress subnet if you can find it)
- IP Protocol: TCP
- Destination Port Range: 5432

Save. **Critically**, Oracle's "Security List" is in addition to iptables on the VM. Ubuntu's default iptables rules also block 5432, so:

```bash
ssh ubuntu@<server-ip>

# Open iptables for 5432 (Oracle's Ubuntu image has restrictive default rules)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5432 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Install Postgres 17

```bash
sudo apt update && sudo apt install -y curl ca-certificates gnupg lsb-release
sudo install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | sudo gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install -y postgresql-17 postgresql-client-17 fail2ban
```

ARM builds of postgres-17 are in the PGDG arm64 repo — `apt` handles this transparently.

## 4. Create role + database (same as Hetzner)

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE fleetcrown WITH LOGIN PASSWORD 'CHANGE_ME_BEFORE_USE';
CREATE DATABASE fleetcrown OWNER fleetcrown;
SQL
```

## 5. Configure listen + SSL + auth (same as Hetzner)

```bash
sudo sed -i "s/^#listen_addresses.*/listen_addresses = '*'/" /etc/postgresql/17/main/postgresql.conf
sudo sed -i "s/^#ssl = on/ssl = on/" /etc/postgresql/17/main/postgresql.conf
echo "hostssl all fleetcrown 0.0.0.0/0 scram-sha-256" | sudo tee -a /etc/postgresql/17/main/pg_hba.conf
echo "hostssl all fleetcrown ::/0      scram-sha-256" | sudo tee -a /etc/postgresql/17/main/pg_hba.conf
sudo systemctl restart postgresql
```

## 6. Verify from your laptop

```bash
psql "postgresql://fleetcrown:CHANGE_ME_BEFORE_USE@<server-ip>:5432/fleetcrown?sslmode=require" -c "SELECT version();"
```

If this hangs: Oracle's security list AND the VM iptables both need 5432 open (step 2). Most common gotcha.

## 7-9. Restore, flip Vercel, smoke test

Identical to SETUP_HETZNER.md sections 6-8.

## Oracle-specific gotchas

- **Idle reclamation**: if the instance gets <20% CPU + low memory for ~7 days, Oracle may reclaim it. The Postgres process should be enough to avoid this, but if you have a quiet stretch, consider a cron job that runs `SELECT 1` to keep things warm.
- **Region lottery**: Free Tier ARM capacity is exhausted in some regions. If you can't get an A1.Flex instance, try a different home region (you only get one home region per account).
- **Boot volume backups cost money** even with Always Free compute. Take application-level backups (`pg_dump` to S3-compatible storage) instead.

## 10. Daily care

```bash
# /etc/cron.daily/fleetcrown-backup.sh
#!/bin/bash
mkdir -p /backups
sudo -u postgres pg_dump fleetcrown | gzip > /backups/fleetcrown-$(date +%F).sql.gz
find /backups -name 'fleetcrown-*.sql.gz' -mtime +30 -delete
```

`chmod +x` and let cron handle the rest.
