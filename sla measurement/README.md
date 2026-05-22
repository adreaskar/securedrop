# SecureDrop SLA Measurements

Αυτό το έγγραφο περιγράφει τις μετρήσεις SLA για το cloud-native pipeline σάρωσης αρχείων του SecureDrop.

## Πεδίο

Η μετρούμενη ροή είναι η end-to-end διαδρομή σάρωσης αρχείων:

```text
File upload
→ API stores metadata with status=quarantine
→ File is uploaded to MinIO quarantine bucket
→ MinIO event is sent to RabbitMQ
→ Node-RED consumes the message
→ Node-RED triggers the Knative scanner
→ Scanner streams the file from MinIO
→ Scanner sends the stream to ClamAV
→ Scanner moves the file to approved/rejected bucket
→ Scanner calls the API status update endpoint
→ API changes file status to approved/rejected
```

### Κύρια μέτρηση SLA

```text
End-to-end scan latency =
time from successful upload creation
until API receives status change approved/rejected
```

## Συμμετέχοντα στοιχεία

| Component       | Ρόλος                                                          |
| --------------- | ------------------------------------------------------------- |
| SecureDrop API  | Διαχειρίζεται uploads και ενημερώσεις κατάστασης αρχείων        |
| MinIO           | Φιλοξενεί αρχεία quarantine/approved/rejected                  |
| RabbitMQ        | Μεταφέρει γεγονότα MinIO uploads                               |
| Node-RED        | Trigger αυτοματισμού και χειρισμός ACK                         |
| Knative Serving | Εκτελεί τον σαρωτή ως serverless function                      |
| Kourier         | Δίκτυο Knative                                                |
| ClamAV          | Μηχανή σάρωσης malware                                        |
| Vault           | Εισάγει μυστικά και ρυθμίσεις για τον scanner                 |
| ArgoCD          | Συγχρονίζει manifests Kubernetes από Git                      |

## Μέθοδος μέτρησης

Οι μετρήσεις συλλέχθηκαν με scripts που εκτελούσαν uploads μέσω του δημόσιου API endpoint:

```bash
POST https://api.securedrop.gr/api/files/upload
```

Απαιτούμενα multipart πεδία:

- `file`
- `recipientEmail`

Authentication:

- `Authorization: Bearer <access_token>`

Τα logs της API χρησιμοποιήθηκαν για τον συσχετισμό των γεγονότων:

- `Uploaded file to quarantine: <senderId>/<fileId>/<filename>`
- `Received status change for fileId: <fileId>, status: approved`

Η λανθάνουσα κατάσταση υπολογίστηκε ως:

```text
status_change_timestamp - upload_createdAt_timestamp
```

## Σενάρια δοκιμών

Καταγράφηκαν τρία σενάρια:

### 1. Cold Start

- Ο σαρωτής ξεκινά από μηδενικές replicas πριν από κάθε upload.
- Σκοπός: μέτρηση της επίδρασης του Knative cold start.

Έλεγχος scale-to-zero:

```bash
kubectl get pods -n default | grep securedrop-scanner || true
```

### 2. Warm Execution

- Ο σαρωτής είναι ήδη σε λειτουργία πριν από κάθε upload.
- Σκοπός: μέτρηση σταθερής κατάστασης χωρίς overhead cold-start.

Warm-up command:

```bash
kubectl run curl-test -n default --rm -it --image=curlimages/curl -- sh
curl http://securedrop-scanner.default.svc.cluster.local/health
```

### 3. Concurrent Uploads

- Έγιναν 10 παράλληλα uploads ίδιου αρχείου 10MB.
- Σκοπός: μέτρηση συμπεριφοράς burst και ουράς υπό παράλληλο φορτίο.

## Αποτελέσματα

### Σύνοψη

| Scenario             | Samples | Success |   Avg |   Min |    Max |   P50 |    P95 |    P99 |
| -------------------- | ------: | ------: | ----: | ----: | -----: | ----: | -----: | -----: |
| Cold start           |      10 |   10/10 | 8.63s | 2.90s | 10.23s | 9.68s | 10.17s | 10.22s |
| Warm execution       |      10 |   10/10 | 0.58s | 0.29s |  1.08s | 0.47s |  1.00s |  1.07s |
| Concurrent 10 x 10MB |      10 |   10/10 | 7.74s | 6.21s | 10.44s | 7.20s | 10.19s | 10.39s |

## Τάξεις SLA

| SLA Class | Σενάριο                        | Στόχος            |
| --------- | ----------------------------- | -----------------:|
| Gold      | Warm scanner, active pod      | 99% κάτω από 1.5s  |
| Silver    | Cold start από μηδενικές replicas | 99% κάτω από 11s  |
| Bronze    | 10 παράλληλα uploads 10MB     | 95% κάτω από 11s   |

## Ερμηνεία

- Το warm execution έχει τη χαμηλότερη καθυστέρηση, με P99 περίπου 1.07 δευτερόλεπτα.
- Το cold start περιλαμβάνει Knative scale-from-zero, Vault injection/startup, εκκίνηση σαρωτή, ανάκτηση stream από MinIO, σάρωση ClamAV, μετακίνηση αντικειμένου και ενημέρωση κατάστασης API. Το P99 ήταν περίπου 10.22 δευτερόλεπτα.
- Το concurrent upload σενάριο δείχνει ότι το pipeline μπορεί να επεξεργαστεί 10 παράλληλα uploads επιτυχώς, με P95 περίπου 10.19 δευτερόλεπτα.

### Παρατήρηση για μεγάλα uploads

- Τα μεμονωμένα uploads 50MB ολοκληρώθηκαν επιτυχώς.
- Σε δοκιμή με 10 παράλληλα uploads 50MB, 2/10 επέστρεψαν `HTTP 201` και 8/10 `HTTP 502`.

Αυτό υποδεικνύει ότι η συμφόρηση για μεγάλα παράλληλα uploads πιθανότατα συμβαίνει πριν από τον σαρωτή, στο upload/API/ingress/proxy layer.

Για αυτό το λόγο, η μέτρηση SLA παράλληλου φορτίου έγινε με 10MB αρχεία, ώστε να απομονωθεί καλύτερα η serverless pipeline σαρώσεων.

## Εντολές παρακολούθησης

### Έλεγχος Knative Service

```bash
kubectl get ksvc securedrop-scanner -n default
```

Αναμενόμενο αποτέλεσμα:

- `READY=True`
- `URL=http://securedrop-scanner.default.svc.cluster.local`

### Παρακολούθηση pods σαρωτή

```bash
watch "kubectl get pods -n default | grep securedrop-scanner || true"
```

### API logs

```bash
kubectl logs -n default deploy/securedrop-api -c securedrop-api --timestamps -f \
  | grep --line-buffered -E "Uploaded file to quarantine|Received status change"
```

### Scanner logs

```bash
POD=$(kubectl get pod -n default | grep securedrop-scanner | grep Running | awk '{print $1}' | head -1)
kubectl logs -n default "$POD" -c securedrop-scanner --timestamps --tail=100
```

### RabbitMQ queue

```bash
kubectl exec -n default deploy/rabbitmq -c rabbitmq -- \
  rabbitmqctl list_queues name messages_ready messages_unacknowledged messages
```

## Scripts μέτρησης

Χρησιμοποιήθηκαν τα παρακάτω scripts:

- `measure_cold_sla.sh`
- `measure_warm_sla.sh`
- `measure_concurrent_sla.sh`

Παράδειγμα χρήσης:

```bash
export TOKEN='<bearer_token_without_Bearer_prefix>'

RUNS=10 \
RECIPIENT_EMAIL='adreas@karabetian.gr' \
OUTPUT='cold_sla_10_runs.csv' \
./measure_cold_sla.sh load-files/test-1.bin

RUNS=10 \
RECIPIENT_EMAIL='adreas@karabetian.gr' \
OUTPUT='warm_sla_10_runs.csv' \
./measure_warm_sla.sh load-files/test-1.bin

CONCURRENCY=10 \
RECIPIENT_EMAIL='adreas@karabetian.gr' \
OUTPUT='concurrent_sla_10x10mb.csv' \
./measure_concurrent_sla.sh test-10mb.bin
```

## Συμπέρασμα

Οι μετρήσεις SLA δείχνουν ότι ο SecureDrop serverless scanner έχει καλή απόδοση σε warm και cold mode.

Η μεγαλύτερη διαφορά καθυστέρησης προέρχεται από το Knative cold start. Οι warm εκτελέσεις κλείνουν κάτω από 1.5 δευτερόλεπτα στο P99, ενώ οι cold starts είναι περίπου 11 δευτερόλεπτα στο P99. Σε παράλληλο φορτίο 10 uploads x 10MB, όλα τα αρχεία επεξεργάστηκαν με επιτυχία και P95 γύρω στα 10.19 δευτερόλεπτα.

Αυτά τα αποτελέσματα δικαιολογούν τις καθορισμένες SLA κλάσεις και δείχνουν την επίδραση του serverless autoscaling στην απόδοση του συστήματος.