// =======================
// Jenkinsfile (Declarative) — Frontend + Backend
// Branch main -> DEV (auto) | Tag -> PROD (approval)
// =======================
pipeline {

  agent {
    kubernetes {
      cloud 'Kubernetes'
      yaml """
apiVersion: v1
kind: Pod
metadata:
  labels: { jenkins: agent }
spec:
  serviceAccountName: jenkins
  imagePullSecrets: [{ name: regcred }]
  securityContext: { fsGroup: 1000 }

  initContainers:
  - name: init-perms
    image: busybox:1.36
    command: ["sh","-c"]
    args: ["mkdir -p /home/jenkins/agent && chmod 0777 /home/jenkins/agent"]
    volumeMounts: [{ name: workspace-volume, mountPath: /home/jenkins/agent }]

  containers:
  - name: node
    image: docker.io/library/node:20-bullseye
    imagePullPolicy: IfNotPresent
    command: ["cat"]
    tty: true
    workingDir: /home/jenkins/agent
    env: [{ name: NPM_CONFIG_CACHE, value: /home/jenkins/.npm }]
    resources: { requests: {cpu: "300m", memory: "768Mi"}, limits: {cpu: "1", memory: "1536Mi"} }
    volumeMounts:
      - { name: workspace-volume, mountPath: /home/jenkins/agent }
      - { name: npm-cache,       mountPath: /home/jenkins/.npm }

  - name: maven
    image: docker.io/library/maven:3.9-eclipse-temurin-17
    imagePullPolicy: IfNotPresent
    command: ["cat"]
    tty: true
    workingDir: /home/jenkins/agent
    env: [{ name: MAVEN_CONFIG, value: /home/jenkins/.m2 }]
    resources: { requests: {cpu: "300m", memory: "768Mi"}, limits: {cpu: "1", memory: "1536Mi"} }
    volumeMounts:
      - { name: workspace-volume, mountPath: /home/jenkins/agent }
      - { name: m2-cache,         mountPath: /home/jenkins/.m2 }

  - name: kaniko
    image: gcr.io/kaniko-project/executor:v1.23.2-debug
    imagePullPolicy: IfNotPresent
    command: ["cat"]
    tty: true
    env: [{ name: DOCKER_CONFIG, value: /kaniko/.docker }]
    workingDir: /home/jenkins/agent
    resources: { requests: {cpu: "300m", memory: "1Gi"}, limits: {cpu: "1", memory: "2Gi"} }
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

  volumes:
  - name: docker-config
    secret:
      secretName: regcred
      items: [{ key: .dockerconfigjson, path: config.json }]
  - name: workspace-volume
    emptyDir: {}
  - name: npm-cache
    emptyDir: {}
  - name: m2-cache
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
    // ---- Images
    DOCKER_IMAGE        = 'adelbettaieb/gestionentreprise'              // backend
    DOCKER_IMAGE_FE     = 'adelbettaieb/gestionentreprise-frontend'     // frontend

    // ---- K8s (DEV)
    K8S_NS              = 'jenkins'
    // Backend
    BACKEND_DEPLOYMENT  = 'gestionentreprise'
    BACKEND_CONTAINER   = 'app'
    INGRESS_HOST        = 'app.local'
    // Frontend
    FRONTEND_DEPLOYMENT = 'frontend'
    FRONTEND_CONTAINER  = 'frontend'
    FRONTEND_INGRESS_HOST = 'front.local'

    // ---- K8s (PROD)
    PROD_NS             = 'prod'
    PROD_INGRESS_HOST   = 'app.prod.local'
    PROD_FRONTEND_HOST  = 'front.prod.local'
  }

  stages {

    stage('Checkout') {
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          retry(2) {
            checkout([$class: 'GitSCM',
              branches: [[name: '*/main']],
              userRemoteConfigs: [[url: 'https://github.com/Adelbett/frontgestionentreprise.git', credentialsId: 'token_github']],
              extensions: [[$class: 'CloneOption', shallow: true, depth: 1, noTags: true, honorRefspec: true]]
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

          echo "Backend image  => docker.io/${env.DOCKER_IMAGE}:${env.TAG}"
          echo "Frontend image => docker.io/${env.DOCKER_IMAGE_FE}:${env.TAG}"
          echo "SHORT_SHA=${env.SHORT_SHA}  GIT_TAG=${env.GIT_TAG}"
        }
      }
    }

    stage('Sanity') {
      steps { container('kubectl') { sh 'set -x; whoami || true; pwd; ls -la .; df -h; free -m' } }
    }

    stage('Pre-flight: versions') {
      steps {
        container('kubectl') { sh 'kubectl version --client=true' }
        container('node')    { sh 'node --version && npm --version' }
        container('maven')   { sh 'mvn -v' }
      }
    }

    // ---------------- FRONTEND ----------------
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
                  npm ci --prefer-offline --no-audit --progress=false || npm install --prefer-offline --no-audit --progress=false
                  # Build local (utile pour valider et pour les tests)
                  npm run build -- --configuration=production --no-progress --output-path=dist/frontend
                '''
              }
            }
          }
        }
      }
    }

    stage('Install Chromium (for Karma)') {
      steps {
        container('node') {
          sh '''
            set -eux
            apt-get update
            DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
              chromium ca-certificates libnss3 libgbm1 libgtk-3-0 libatk-bridge2.0-0 \
              libasound2 fonts-liberation xdg-utils
            apt-get clean && rm -rf /var/lib/apt/lists/*
            export CHROME_BIN="$(command -v chromium || command -v chromium-browser)"; "$CHROME_BIN" --version
          '''
        }
      }
    }

    stage('Test Frontend') {
      steps {
        retry(2) {
          timeout(time: 25, unit: 'MINUTES') {
            container('node') {
              dir('employee frontend final') {
                sh '''
                  set -eux
                  export NG_CLI_ANALYTICS=false CI=true NODE_OPTIONS="--max-old-space-size=1536"
                  npm i -D karma-junit-reporter karma-coverage
                  cat > karma.jenkins.conf.js <<'EOF'
                  module.exports = config => {
                    config.set({
                      singleRun: true,
                      browsers: ['ChromeHeadlessNoSandbox'],
                      customLaunchers: { ChromeHeadlessNoSandbox: { base: 'ChromeHeadless', flags: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'] } },
                      reporters: ['progress','junit','coverage'],
                      junitReporter: { outputDir: 'test-results', outputFile: 'karma.xml', useBrowserName: false },
                      coverageReporter: { dir: 'coverage', reporters: [{ type: 'lcovonly', subdir: '.' }] }
                    });
                  };
                  EOF
                  export CHROME_BIN="$(command -v chromium || command -v chromium-browser)"
                  npm run test -- --karma-config=karma.jenkins.conf.js --watch=false --browsers=ChromeHeadlessNoSandbox --no-progress --code-coverage
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

    // ---------------- BACKEND ----------------
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
                  MVN_COMMON="-B -Dmaven.repo.local=$MVN_REPO -Dhttp.keepAlive=false -Dmaven.wagon.http.pool=false -Dmaven.wagon.http.retryHandler.count=3"
                  if [ -x ./mvnw ]; then ./mvnw $MVN_COMMON -DskipTests -Dmaven.test.skip=true package; else mvn $MVN_COMMON -DskipTests -Dmaven.test.skip=true package; fi
                '''
              }
            }
          }
        }
      }
      post { always { archiveArtifacts artifacts: 'emp_backend/target/*.jar', allowEmptyArchive: true } }
    }

    // ---------------- IMAGES (KANIKO) ----------------
    stage('Build & Push Frontend Image (Kaniko)') {
      when { anyOf { branch 'main'; buildingTag() } }
      steps {
        retry(2) {
          timeout(time: 25, unit: 'MINUTES') {
            container('kaniko') {
              sh '''
                set -euxo pipefail
                FRONT_DIR="$WORKSPACE/employee frontend final"
                DOCKERFILE="$FRONT_DIR/Dockerfile"
                test -d "$FRONT_DIR" && test -f "$DOCKERFILE"
                echo ">> Push FE: docker.io/$DOCKER_IMAGE_FE:$TAG"
                /kaniko/executor --context "$FRONT_DIR" --dockerfile "$DOCKERFILE" \
                  --destination "docker.io/$DOCKER_IMAGE_FE:$TAG" --snapshot-mode=redo --verbosity=info
                if [ -n "${SHORT_SHA:-}" ]; then
                  /kaniko/executor --context "$FRONT_DIR" --dockerfile "$DOCKERFILE" \
                    --destination "docker.io/$DOCKER_IMAGE_FE:$SHORT_SHA" --snapshot-mode=redo --verbosity=info
                fi
                GIT_TAG="$(git describe --tags --exact-match 2>/dev/null || true)"
                if [ -n "$GIT_TAG" ]; then
                  /kaniko/executor --context "$FRONT_DIR" --dockerfile "$DOCKERFILE" \
                    --destination "docker.io/$DOCKER_IMAGE_FE:$GIT_TAG" --snapshot-mode=redo --verbosity=info
                fi
              '''
            }
          }
        }
      }
    }

    stage('Build & Push Backend Image (Kaniko)') {
      when { anyOf { branch 'main'; buildingTag() } }
      steps {
        retry(2) {
          timeout(time: 30, unit: 'MINUTES') {
            container('kaniko') {
              sh '''
                set -euo pipefail
                CONTEXT_DIR="$WORKSPACE/emp_backend"
                DOCKERFILE="$CONTEXT_DIR/Dockerfile"
                test -d "$CONTEXT_DIR" && test -f "$DOCKERFILE"
                echo ">> Push BE: docker.io/$DOCKER_IMAGE:$TAG"
                /kaniko/executor --context "$CONTEXT_DIR" --dockerfile "$DOCKERFILE" \
                  --destination "docker.io/$DOCKER_IMAGE:$TAG" --snapshot-mode=redo --verbosity=info
                if [ -n "${SHORT_SHA:-}" ]; then
                  /kaniko/executor --context "$CONTEXT_DIR" --dockerfile "$DOCKERFILE" \
                    --destination "docker.io/$DOCKER_IMAGE:$SHORT_SHA" --snapshot-mode=redo --verbosity=info
                fi
                GIT_TAG="$(git describe --tags --exact-match 2>/dev/null || true)"
                if [ -n "$GIT_TAG" ]; then
                  /kaniko/executor --context "$CONTEXT_DIR" --dockerfile "$DOCKERFILE" \
                    --destination "docker.io/$DOCKER_IMAGE:$GIT_TAG" --snapshot-mode=redo --verbosity=info
                fi
              '''
            }
          }
        }
      }
    }

    // ---------------- DEPLOYS DEV ----------------
    stage('Deploy to Kubernetes (DEV)') {
      when { allOf { branch 'main'; not { buildingTag() } } }
      steps {
        retry(2) {
          container('kubectl') {
            sh '''
              set -eux
              # Appliquer vos manifests (assurez-vous d’avoir k8s/ avec backend + frontend)
              test -d "$WORKSPACE/k8s" && kubectl -n "$K8S_NS" apply -f "$WORKSPACE/k8s"

              DEPLOY_TAG="${SHORT_SHA:-$TAG}"

              # Backend
              kubectl -n "$K8S_NS" set image "deploy/${BACKEND_DEPLOYMENT}" "${BACKEND_CONTAINER}=docker.io/${DOCKER_IMAGE}:${DEPLOY_TAG}"
              kubectl -n "$K8S_NS" rollout status "deploy/${BACKEND_DEPLOYMENT}" --timeout=420s

              # Frontend
              kubectl -n "$K8S_NS" set image "deploy/${FRONTEND_DEPLOYMENT}" "${FRONTEND_CONTAINER}=docker.io/${DOCKER_IMAGE_FE}:${DEPLOY_TAG}"
              kubectl -n "$K8S_NS" rollout status "deploy/${FRONTEND_DEPLOYMENT}" --timeout=420s
            '''
          }
        }
      }
    }

    stage('Smoke Test (DEV Ingress)') {
      when { allOf { branch 'main'; not { buildingTag() } } }
      steps {
        retry(2) {
          container('kubectl') {
            sh '''
              set -eux
              # Backend ingress
              kubectl -n "$K8S_NS" run smoke-be --rm -i --restart=Never --image=curlimages/curl -- \
                -sSI -H "Host: $INGRESS_HOST" \
                http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/ | head -n1

              # Frontend ingress
              kubectl -n "$K8S_NS" run smoke-fe --rm -i --restart=Never --image=curlimages/curl -- \
                -sSI -H "Host: $FRONTEND_INGRESS_HOST" \
                http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/ | head -n1
            '''
          }
        }
      }
    }

    // ---------------- PROD ----------------
    stage('Approve PROD deploy') {
      when { buildingTag() }
      steps { input message: "Déployer ${env.GIT_TAG ?: env.BRANCH_NAME} en PROD (${env.PROD_NS}) ?", ok: 'Déployer' }
    }

    stage('Deploy to Kubernetes (PROD)') {
      when { buildingTag() }
      steps {
        retry(2) {
          container('kubectl') {
            sh '''
              set -eux
              test -d "$WORKSPACE/k8s" && kubectl -n "$PROD_NS" apply -f "$WORKSPACE/k8s"

              REL_TAG="${GIT_TAG:-$SHORT_SHA}"

              # Backend
              kubectl -n "$PROD_NS" set image "deploy/${BACKEND_DEPLOYMENT}" "${BACKEND_CONTAINER}=docker.io/${DOCKER_IMAGE}:${REL_TAG}"
              kubectl -n "$PROD_NS" rollout status "deploy/${BACKEND_DEPLOYMENT}" --timeout=600s

              # Frontend
              kubectl -n "$PROD_NS" set image "deploy/${FRONTEND_DEPLOYMENT}" "${FRONTEND_CONTAINER}=docker.io/${DOCKER_IMAGE_FE}:${REL_TAG}"
              kubectl -n "$PROD_NS" rollout status "deploy/${FRONTEND_DEPLOYMENT}" --timeout=600s
            '''
          }
        }
      }
    }

    stage('Smoke Test (PROD Ingress)') {
      when { buildingTag() }
      steps {
        retry(2) {
          container('kubectl') {
            sh '''
              set -eux
              # Backend
              kubectl -n "$PROD_NS" run smoke-be --rm -i --restart=Never --image=curlimages/curl -- \
                -sSI -H "Host: $PROD_INGRESS_HOST" \
                http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/ | head -n1

              # Frontend
              kubectl -n "$PROD_NS" run smoke-fe --rm -i --restart=Never --image=curlimages/curl -- \
                -sSI -H "Host: $PROD_FRONTEND_HOST" \
                http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/ | head -n1
            '''
          }
        }
      }
    }
  }

  post {
    success {
      script {
        def deployedTag = (env.GIT_TAG?.trim()) ? env.GIT_TAG
                         : (env.SHORT_SHA?.trim() ? env.SHORT_SHA
                         : (env.TAG?.trim() ?: 'latest'))
        echo "✅ Deployed FRONT docker.io/${env.DOCKER_IMAGE_FE}:${deployedTag}"
        echo "✅ Deployed BACK  docker.io/${env.DOCKER_IMAGE}:${deployedTag}"
      }
    }
    failure { echo "❌ Build failed — check the first failing stage in Console Output" }
    always  { cleanWs() }
  }
}
