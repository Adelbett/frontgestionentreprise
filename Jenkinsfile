// =======================
// Jenkinsfile (Declarative) — CI/CD: main->dev (auto) | tag->prod (approval)
// + Trivy (non-bloquant) + Email d'alerte si >=1 HIGH/CRITICAL
// =======================
pipeline {

  agent {
    kubernetes {
      cloud 'Kubernetes'
      yaml """
apiVersion: v1
kind: Pod
metadata:
  labels:
    jenkins: agent
spec:
  serviceAccountName: jenkins
  imagePullSecrets:
  - name: regcred

  securityContext:
    fsGroup: 1000

  initContainers:
  - name: init-perms
    image: busybox:1.36
    command: ["sh","-c"]
    args: ["mkdir -p /home/jenkins/agent && chmod 0777 /home/jenkins/agent"]
    volumeMounts:
    - name: workspace-volume
      mountPath: /home/jenkins/agent

  containers:
  - name: node
    image: docker.io/library/node:20-bullseye
    imagePullPolicy: IfNotPresent
    command: ["cat"]
    tty: true
    workingDir: /home/jenkins/agent
    env:
    - name: NPM_CONFIG_CACHE
      value: /home/jenkins/.npm
    resources:
      requests: { cpu: "300m", memory: "768Mi" }
      limits:   { cpu: "1",    memory: "1536Mi" }
    volumeMounts:
    - { name: workspace-volume, mountPath: /home/jenkins/agent }
    - { name: npm-cache,       mountPath: /home/jenkins/.npm }

  - name: maven
    image: docker.io/library/maven:3.9-eclipse-temurin-17
    imagePullPolicy: IfNotPresent
    command: ["cat"]
    tty: true
    workingDir: /home/jenkins/agent
    env:
    - { name: MAVEN_CONFIG, value: /home/jenkins/.m2 }
    resources:
      requests: { cpu: "300m", memory: "768Mi" }
      limits:   { cpu: "1",    memory: "1536Mi" }
    volumeMounts:
    - { name: workspace-volume, mountPath: /home/jenkins/agent }
    - { name: m2-cache,         mountPath: /home/jenkins/.m2 }

  - name: kaniko
    image: gcr.io/kaniko-project/executor:v1.23.2-debug
    imagePullPolicy: IfNotPresent
    command: ["cat"]
    tty: true
    env:
    - { name: DOCKER_CONFIG, value: /kaniko/.docker }
    workingDir: /home/jenkins/agent
    resources:
      requests: { cpu: "300m", memory: "1Gi" }
      limits:   { cpu: "1",    memory: "2Gi" }
    volumeMounts:
    - { name: docker-config,    mountPath: /kaniko/.docker }
    - { name: workspace-volume, mountPath: /home/jenkins/agent }

  - name: kubectl
    image: bitnami/kubectl:1.29-debian-12
    imagePullPolicy: IfNotPresent
    command: ["/bin/sh","-c"]
    args: ["sleep 99d"]
    tty: true
    securityContext: { runAsUser: 0 }
    workingDir: /home/jenkins/agent
    volumeMounts:
    - { name: workspace-volume, mountPath: /home/jenkins/agent }

  # --- Nouveau : conteneur Trivy ---
  - name: trivy
    image: mirror.gcr.io/aquasec/trivy:0.65.0
    imagePullPolicy: IfNotPresent
    command: ["sleep","99d"]
    tty: true
    workingDir: /home/jenkins/agent
    env:
    - name: TRIVY_CACHE_DIR
      value: /home/jenkins/.trivy-cache
    volumeMounts:
    - { name: workspace-volume, mountPath: /home/jenkins/agent }
    - { name: trivy-cache,      mountPath: /home/jenkins/.trivy-cache }
    - { name: docker-config,    mountPath: /root/.docker }  # auth registry si besoin

  volumes:
  - name: docker-config
    secret:
      secretName: regcred
      items:
      - { key: .dockerconfigjson, path: config.json }

  - name: workspace-volume
    emptyDir: {}

  - name: npm-cache
    emptyDir: {}

  - name: m2-cache
    emptyDir: {}

  # --- Nouveau : cache Trivy ---
  - name: trivy-cache
    emptyDir: {}
"""
      defaultContainer 'kubectl'
    }
  }

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    skipDefaultCheckout(true)
  }

  triggers { githubPush() }

  environment {
    DOCKER_IMAGE       = 'adelbettaieb/gestionentreprise'
    K8S_NS             = 'jenkins'     // dev namespace
    APP_NAME           = 'gestionentreprise'
    INGRESS_HOST       = 'app.local'   // dev ingress host

    PROD_NS            = 'prod'
    PROD_INGRESS_HOST  = 'app.prod.local'

    // --- Email + seuils Trivy (alerte si >=1) ---
    ALERT_EMAILS   = 'adelbettaieb97@gmail.com'
    TRIVY_MAX_CRIT = '0'
    TRIVY_MAX_HIGH = '0'
  }

  stages {

    stage('Checkout') {
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          retry(2) {
            checkout([$class: 'GitSCM',
              branches: [[name: '*/main']],
              userRemoteConfigs: [[url: 'https://github.com/Adelbett/frontgestionentreprise.git', credentialsId: 'token_github']],
              extensions: [
                [$class: 'CloneOption', shallow: true, depth: 1, noTags: true, honorRefspec: true]
              ]
            ])
          }
        }
      }
    }

    stage('Init vars') {
      steps {
        script {
          def branch      = (env.BRANCH_NAME ?: 'main')
          def safeBranch  = branch.toLowerCase().replaceAll(/[^a-z0-9._-]/, '-')
          env.SAFE_BRANCH = safeBranch
          env.SHORT_SHA   = (env.GIT_COMMIT ? env.GIT_COMMIT.take(8) : '')
          env.TAG         = (safeBranch == 'main') ? 'latest' : "${safeBranch}-${env.BUILD_NUMBER}"
          env.GIT_TAG     = sh(script: 'git describe --tags --exact-match 2>/dev/null || true', returnStdout: true).trim()

          echo "Docker image => docker.io/${env.DOCKER_IMAGE}:${env.TAG}"
          echo "SHORT_SHA=${env.SHORT_SHA}  GIT_TAG=${env.GIT_TAG}"
        }
      }
    }

    stage('Sanity sh') {
      steps {
        container('kubectl') {
          sh 'set -x; whoami || true; pwd; ls -ld .; df -h; free -m'
        }
      }
    }

    stage('Pre-flight: versions') {
      steps {
        container('kubectl') { sh 'kubectl version --client=true' }
        container('node')    { sh 'node --version && npm --version' }
        container('maven')   { sh 'mvn -v' }
      }
    }

    // ---- FRONTEND BUILD (Angular) ----
    stage('Build Frontend') {
      steps {
        retry(2) {
          timeout(time: 25, unit: 'MINUTES') {
            container('node') {
              dir('employee frontend final') {
                sh '''
                  set -eux
                  export NG_CLI_ANALYTICS=false
                  export CI=true
                  export NODE_OPTIONS="--max-old-space-size=1536"
                  export NG_BUILD_MAX_WORKERS=1

                  npm config set fund false
                  npm ci --prefer-offline --no-audit --progress=false || \
                  npm install --prefer-offline --no-audit --progress=false

                  npm run build -- --configuration=production --no-progress
                '''
              }
            }
          }
        }
      }
    }

    // Installe Chromium dans le conteneur Node (pour Karma headless)
    stage('Install Chromium (for Karma)') {
      steps {
        container('node') {
          sh '''
            set -eux
            apt-get update
            DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
              chromium ca-certificates libnss3 libgbm1 libgtk-3-0 libatk-bridge2.0-0 \
              libasound2 fonts-liberation xdg-utils
            apt-get clean
            rm -rf /var/lib/apt/lists/*

            export CHROME_BIN="$(command -v chromium || command -v chromium-browser)"
            echo "CHROME_BIN=$CHROME_BIN"
            "$CHROME_BIN" --version
          '''
        }
      }
    }

    // ---- TESTS FRONTEND (Karma headless) ----
    stage('Test Frontend') {
      steps {
        retry(2) {
          timeout(time: 25, unit: 'MINUTES') {
            container('node') {
              dir('employee frontend final') {
                sh '''
                  set -eux
                  export NG_CLI_ANALYTICS=false
                  export CI=true
                  export NODE_OPTIONS="--max-old-space-size=1536"

                  npm i -D karma-junit-reporter karma-coverage

                  cat > karma.jenkins.conf.js <<'EOF'
                  module.exports = function (config) {
                    config.set({
                      singleRun: true,
                      browsers: ['ChromeHeadlessNoSandbox'],
                      customLaunchers: {
                        ChromeHeadlessNoSandbox: {
                          base: 'ChromeHeadless',
                          flags: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']
                        }
                      },
                      reporters: ['progress','junit','coverage'],
                      junitReporter: { outputDir: 'test-results', outputFile: 'karma.xml', useBrowserName: false },
                      coverageReporter: { dir: 'coverage', reporters: [{ type: 'lcovonly', subdir: '.' }] }
                    });
                  };
                  EOF

                  export CHROME_BIN="$(command -v chromium || command -v chromium-browser)"
                  echo "Using CHROME_BIN=$CHROME_BIN"
                  "$CHROME_BIN" --version

                  npm run test -- \
                    --karma-config=karma.jenkins.conf.js \
                    --watch=false \
                    --browsers=ChromeHeadlessNoSandbox \
                    --no-progress \
                    --code-coverage
                '''
              }
            }
          }
        }
      }
      post {
        always {
          dir('employee frontend final') {
            junit allowEmptyResults: true, testResults: 'test-results/*.xml'
            archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
          }
        }
      }
    }

    // ---- BACKEND BUILD (Maven) — TESTS DÉSACTIVÉS ----
    stage('Build Backend (Maven)') {
      steps {
        retry(2) {
          timeout(time: 35, unit: 'MINUTES') {
            container('maven') {
              dir('emp_backend') {
                sh '''
                  set -eux
                  export MAVEN_OPTS="-Xms256m -Xmx1024m -XX:+UseSerialGC -Djava.awt.headless=true"
                  MVN_REPO="${MAVEN_CONFIG:-/home/jenkins/.m2}"
                  MVN_COMMON="-B -Dmaven.repo.local=$MVN_REPO \
                    -Dhttp.keepAlive=false -Dmaven.wagon.http.pool=false \
                    -Dmaven.wagon.http.retryHandler.count=3"

                  # Désactivation forte des tests (exécution + compilation)
                  if [ -x ./mvnw ]; then
                    ./mvnw  $MVN_COMMON -DskipTests -Dmaven.test.skip=true package
                  else
                    mvn     $MVN_COMMON -DskipTests -Dmaven.test.skip=true package
                  fi
                '''
              }
            }
          }
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'emp_backend/target/*.jar', allowEmptyArchive: true
        }
      }
    }

    // ---- IMAGE DOCKER (Kaniko) ----
    stage('Build & Push Image (Kaniko)') {
      when { anyOf { branch 'main'; buildingTag() } }
      steps {
        retry(2) {
          timeout(time: 30, unit: 'MINUTES') {
            container('kaniko') {
              sh '''
                set -euo pipefail
                CONTEXT_DIR="$WORKSPACE/emp_backend"
                DOCKERFILE="$CONTEXT_DIR/Dockerfile"

                test -d "$CONTEXT_DIR"
                test -f "$DOCKERFILE"

                echo ">> Push : ${DOCKER_IMAGE}:${TAG}"
                /kaniko/executor \
                  --context "$CONTEXT_DIR" \
                  --dockerfile "$DOCKERFILE" \
                  --destination "docker.io/$DOCKER_IMAGE:$TAG" \
                  --snapshot-mode=redo --verbosity=info

                if [ -n "${SHORT_SHA:-}" ]; then
                  echo ">> Also push commit tag: $SHORT_SHA"
                  /kaniko/executor \
                    --context "$CONTEXT_DIR" \
                    --dockerfile "$DOCKERFILE" \
                    --destination "docker.io/$DOCKER_IMAGE:$SHORT_SHA" \
                    --snapshot-mode=redo --verbosity=info
                fi

                GIT_TAG="$(git describe --tags --exact-match 2>/dev/null || true)"
                if [ -n "$GIT_TAG" ]; then
                  echo ">> Also push release tag: $GIT_TAG"
                  /kaniko/executor \
                    --context "$CONTEXT_DIR" \
                    --dockerfile "$DOCKERFILE" \
                    --destination "docker.io/$DOCKER_IMAGE:$GIT_TAG" \
                    --snapshot-mode=redo --verbosity=info
                fi
              '''
            }
          }
        }
      }
    }

    // ---- TRIVY (non-bloquant) : scan de l'image poussée ----
    stage('Trivy Scan (non-blocking)') {
      when { anyOf { branch 'main'; buildingTag() } } // l'image existe dans le registry
      steps {
        container('trivy') {
          sh '''
            set -eux
            # jq pour parser le JSON
            command -v jq >/dev/null 2>&1 || (apk add --no-cache jq >/dev/null)

            IMG="docker.io/${DOCKER_IMAGE}:${TAG}"

            # 1) Scan image -> JSON + SARIF (non bloquant)
            trivy image --skip-version-check --timeout 15m \
              --scanners vuln,secret \
              --exit-code 0 \
              --severity HIGH,CRITICAL \
              --format json  --output trivy-image-report.json "$IMG" || true

            trivy image --skip-version-check --timeout 15m \
              --scanners vuln,secret \
              --exit-code 0 \
              --severity HIGH,CRITICAL \
              --format sarif --output trivy-image-report.sarif "$IMG" || true

            # 2) Extraire les compteurs pour l'alerte
            CRIT=$(jq '[ .Results[].Vulnerabilities[]? | select(.Severity=="CRITICAL") ] | length' trivy-image-report.json)
            HIGH=$(jq '[ .Results[].Vulnerabilities[]? | select(.Severity=="HIGH") ] | length' trivy-image-report.json)

            echo "CRITICAL=$CRIT" >  trivy-counts.env
            echo "HIGH=$HIGH"    >> trivy-counts.env

            echo "Trivy counts: CRITICAL=$CRIT HIGH=$HIGH"
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'trivy-image-report.* , trivy-counts.env', allowEmptyArchive: true
        }
      }
    }

    // ---- DEPLOY DEV (main) ----
    stage('Deploy to Kubernetes (dev)') {
      when { allOf { branch 'main'; not { buildingTag() } } }
      steps {
        retry(2) {
          container('kubectl') {
            sh '''
              set -eux
              test -d "$WORKSPACE/k8s"
              kubectl -n "$K8S_NS" apply -f "$WORKSPACE/k8s"

              DEPLOY_TAG="${SHORT_SHA:-$TAG}"
              echo "Deploying docker.io/$DOCKER_IMAGE:$DEPLOY_TAG to ns=$K8S_NS"
              kubectl -n "$K8S_NS" set image deploy/$APP_NAME app="docker.io/$DOCKER_IMAGE:$DEPLOY_TAG"
              kubectl -n "$K8S_NS" rollout status deploy/$APP_NAME --timeout=420s
            '''
          }
        }
      }
    }

    stage('Smoke Test (dev Ingress)') {
      when { allOf { branch 'main'; not { buildingTag() } } }
      steps {
        retry(2) {
          container('kubectl') {
            sh '''
              set -eux
              kubectl -n "$K8S_NS" run smoke --rm -i --restart=Never --image=curlimages/curl -- \
                -sSI -H "Host: $INGRESS_HOST" \
                http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/ | head -n1
            '''
          }
        }
      }
    }

    // ---- APPROVAL & DEPLOY PROD (tag) ----
    stage('Approve PROD deploy') {
      when { buildingTag() }
      steps {
        input message: "Déployer le tag ${env.GIT_TAG ?: env.BRANCH_NAME} en PROD (${env.PROD_NS}) ?", ok: 'Déployer'
      }
    }

    stage('Deploy to Kubernetes (prod)') {
      when { buildingTag() }
      steps {
        retry(2) {
          container('kubectl') {
            sh '''
              set -eux
              test -d "$WORKSPACE/k8s"
              kubectl -n "$PROD_NS" apply -f "$WORKSPACE/k8s"

              REL_TAG="${GIT_TAG:-$SHORT_SHA}"
              echo "Deploying docker.io/$DOCKER_IMAGE:$REL_TAG to ns=$PROD_NS"
              kubectl -n "$PROD_NS" set image deploy/$APP_NAME app="docker.io/$DOCKER_IMAGE:$REL_TAG"
              kubectl -n "$PROD_NS" rollout status deploy/$APP_NAME --timeout=600s
            '''
          }
        }
      }
    }

    stage('Smoke Test (prod Ingress)') {
      when { buildingTag() }
      steps {
        retry(2) {
          container('kubectl') {
            sh '''
              set -eux
              kubectl -n "$PROD_NS" run smoke --rm -i --restart=Never --image=curlimages/curl -- \
                -sSI -H "Host: $PROD_INGRESS_HOST" \
                http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/ | head -n1
            '''
          }
        }
      }
    }

    // ---- Email d'alerte si seuil dépassé (>=1 HIGH/CRITICAL) ----
    stage('Notify by Email (Trivy)') {
      when { anyOf { branch 'main'; buildingTag() } } // on a produit les rapports
      steps {
        script {
          def countsFile = 'trivy-counts.env'
          if (fileExists(countsFile)) {
            def counts = readFile(countsFile).trim().split('\n') as List
            def map = counts.collectEntries { it.split('=') as List }
            int crit = (map['CRITICAL'] ?: '0') as Integer
            int high = (map['HIGH'] ?: '0') as Integer
            int maxC = env.TRIVY_MAX_CRIT as Integer
            int maxH = env.TRIVY_MAX_HIGH as Integer

            if (crit > maxC || high > maxH) {
              def subject = "ALERTE Trivy: ${env.JOB_NAME} #${env.BUILD_NUMBER} (CRIT:${crit} HIGH:${high})"
              def body = """
Bonjour,

Le scan Trivy a détecté des vulnérabilités au-dessus du seuil:
  - CRITICAL: ${crit} (seuil ${maxC})
  - HIGH:     ${high} (seuil ${maxH})

Rapports:
  JSON : ${env.BUILD_URL}artifact/trivy-image-report.json
  SARIF: ${env.BUILD_URL}artifact/trivy-image-report.sarif

Build: ${env.BUILD_URL}

-- Jenkins
"""
              mail to: env.ALERT_EMAILS, subject: subject, body: body
            } else {
              echo "Seuils non dépassés, pas d’email (CRIT=${crit}/${maxC}, HIGH=${high}/${maxH})."
            }
          } else {
            echo "Pas de fichier trivy-counts.env — skip email."
          }
        }
      }
    }
  }

  post {
    success {
      script {
        def deployedTag = (env.GIT_TAG?.trim())
                          ? env.GIT_TAG
                          : (env.SHORT_SHA?.trim() ? env.SHORT_SHA : (env.TAG?.trim() ?: 'latest'))
        echo "✅ Deployed docker.io/${env.DOCKER_IMAGE}:${deployedTag}"
      }
    }
    failure {
      echo "❌ Build failed — check the first failing stage in Console Output"
    }
    always {
      cleanWs()
    }
  }
}
