# SecureDrop SLA Measurements

This document describes the SLA measurements for the SecureDrop cloud-native file scanning pipeline.

## Scope

The measured workflow is the end-to-end file scanning path:

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

### Main SLA metric

```text
End-to-end scan latency =
time from successful upload creation
until API receives status change approved/rejected
```

## Components involved

| Component       | Role                                                          |
| --------------- | ------------------------------------------------------------- |
| SecureDrop API  | Handles uploads and file status updates                       |
| MinIO           | Stores uploaded files in quarantine/approved/rejected buckets |
| RabbitMQ        | Carries MinIO upload events                                   |
| Node-RED        | Automation trigger and manual ACK handler                     |
| Knative Serving | Runs the scanner as a serverless function                      |
| Kourier         | Knative networking layer                                       |
| ClamAV          | Malware scanning engine                                       |
| Vault           | Injects scanner secrets and configuration                     |
| ArgoCD          | Keeps Kubernetes manifests synced from Git                    |

## Measurement method

Measurements were collected using scripts that performed uploads through the public API endpoint:

```bash
POST https://api.securedrop.gr/api/files/upload
```

Required multipart fields:

- `file`
- `recipientEmail`

Authentication:

- `Authorization: Bearer <access_token>`

API logs were used to correlate events:

- `Uploaded file to quarantine: <senderId>/<fileId>/<filename>`
- `Received status change for fileId: <fileId>, status: approved`

Latency was calculated as:

```text
status_change_timestamp - upload_createdAt_timestamp
```

## Test scenarios

Three scenarios were measured:

### 1. Cold Start

- The scanner starts from zero replicas before each upload.
- Goal: measure Knative cold-start impact.

Scale-to-zero check:

```bash
kubectl get pods -n default | grep securedrop-scanner || true
```

### 2. Warm Execution

- The scanner pod is already running before each upload.
- Goal: measure steady-state latency without cold-start overhead.

Warm-up command:

```bash
kubectl run curl-test -n default --rm -it --image=curlimages/curl -- sh
curl http://securedrop-scanner.default.svc.cluster.local/health
```

### 3. Concurrent Uploads

- 10 parallel uploads of the same 10MB file were sent.
- Goal: measure burst and queuing/scaling behavior under parallel load.

## Results

### Summary

| Scenario             | Samples | Success |   Avg |   Min |    Max |   P50 |    P95 |    P99 |
| -------------------- | ------: | ------: | ----: | ----: | -----: | ----: | -----: | -----: |
| Cold start           |      10 |   10/10 | 8.63s | 2.90s | 10.23s | 9.68s | 10.17s | 10.22s |
| Warm execution       |      10 |   10/10 | 0.58s | 0.29s |  1.08s | 0.47s |  1.00s |  1.07s |
| Concurrent 10 x 10MB |      10 |   10/10 | 7.74s | 6.21s | 10.44s | 7.20s | 10.19s | 10.39s |

## SLA classes

| SLA Class | Scenario                        | Target           |
| --------- | ------------------------------- | ----------------:|
| Gold      | Warm scanner, active pod        | 99% below 1.5s   |
| Silver    | Cold start from zero replicas   | 99% below 11s    |
| Bronze    | 10 concurrent uploads x 10MB    | 95% below 11s    |

## Interpretation

- The warm execution scenario has the lowest latency, with P99 around 1.07 seconds.
- The cold-start scenario includes Knative scale-from-zero, Vault injection/startup, scanner startup, MinIO stream retrieval, ClamAV scanning, object movement, and API status update. P99 was about 10.22 seconds.
- The concurrent upload scenario shows the pipeline can process 10 parallel uploads successfully, with P95 around 10.19 seconds.

### Large uploads observation

- Single 50MB uploads completed successfully.
- In a test with 10 concurrent 50MB uploads, 2/10 returned `HTTP 201` and 8/10 returned `HTTP 502`.

This indicates that large parallel upload bottlenecks likely occur before the scanner, at the upload/API/ingress/proxy layer.

For this reason, the concurrent SLA measurement was performed with 10MB files to better isolate the serverless scanning pipeline.

## Monitoring commands

### Check Knative service

```bash
kubectl get ksvc securedrop-scanner -n default
```

Expected:

- `READY=True`
- `URL=http://securedrop-scanner.default.svc.cluster.local`

### Watch scanner pods

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

## Measurement scripts

The following scripts were used:

- `measure_cold_sla.sh`
- `measure_warm_sla.sh`
- `measure_concurrent_sla.sh`

Example usage:

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

## Conclusion

The SLA measurements show that the SecureDrop serverless scanner performs well in both warm and cold mode.

The largest latency difference is caused by the Knative cold start. Warm executions finish below 1.5 seconds at P99, while cold starts finish around 11 seconds at P99. Under a concurrent burst of 10 uploads x 10MB, all files processed successfully with P95 around 10.19 seconds.

These results support the defined SLA classes and demonstrate the effect of serverless autoscaling on application performance.