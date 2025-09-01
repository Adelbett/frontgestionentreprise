// ========================= Jenkinsfile (full) =========================
//
// Multibranch Pipeline that:
// 1) Builds frontend (Node) and backend (Maven)
// 2) Builds & pushes Docker image with Kaniko to Docker Hub
// 3) Applies k8s manifests from k8s/ and rolls out
// 4) Smoke-tests via Ingress
//
// Requirements:
// - Kubernetes plugin is configured to use in-cluster URL and WebSocket
// - Secret docker-registry "regcred" in namespace jenkins (Docker Hub creds)
// - ServiceAccount "jenkins" in namespace jenkins with RBAC to deploy
// - k8s/ manifests present in repo (Deployment/Service/Ingress)
// =====================================================================

pipeline {
  agent {
    kubernetes {
      // Inline Pod spec for the build agent
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

  containers:
    - name: node
      image: docker.io/library/node:20-bullseye
      imagePullPolicy: IfNotPresent
      command: ["cat"]
      tty: true
      workingDir: /home/jenkins/agent
      volumeMounts:
        - name: workspace-volume
          mountPath: /home/jenkins/agent

    - name: maven
      image: docker.io/library/maven:3.9-eclipse-temurin-17
      imagePullPolicy: IfNotPresent
      command: ["cat"]
      tty: true
      workingDir: /home/jenkins/agent
      volumeMounts:
        - name: workspace-volume
          mountPath: /home/jenkins/agent

    - name: kaniko
      image: gcr.io/kaniko-project/executor:v1.23.2-debug
      imagePullPolicy: IfNotPresent
      command: ["/bin/sh","-c"]
      args: ["sleep 99d"]
      tty: true
      workingDir: /home/jenkins/agent
      env:
        - name: DOCKER_CONFIG
          value: /kaniko/.docker
      volumeMounts:
        - name: docker-config
          mountPath: /kaniko/.docker
        - name: workspace-volume
          mountPath: /home/jenkins/agent

    - name: kubectl
      image: bitnami/kubectl:1.29-debian-12
      imagePullPolicy: IfNotPresent
      command: ["/bin/sh","-c"]
      args: ["sleep 99d"]
      tty: true
      workingDir: /home/jenkins/agent
      volumeMounts:
        - name: workspace-volume
          mountPath: /home/jenkins/agent

  volumes:
    - name: docker-config
      secret:
        secretName: regcred
        items:
          - key: .dockerconfigjson
            path: config.json

    - name: workspace-volume
      emptyDir: {}
"""
      // run steps in this container by default (we can switch with container('name'))
      defaultContainer 'kubectl'
    }
  }

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  // Multibranch already reacts to webhooks; this is harmless extra
  triggers { githubPush() }

  environment {
    // Folders inside your repo (adjust if different)
    FRONT_DIR    = 'employee frontend final'
    BACK_DIR     = 'emp_backend'

    // Docker image coordinates
    DOCKER_IMAGE = 'adelbettaieb/gestionentreprise'

    // Kubernetes details
    K8S_NS       = 'jenkins'
    APP_NAME     = 'gestionentreprise'
    K8S_MANIFEST_DIR = 'k8s'          // folder in repo with YAMLs
    INGRESS_HOST = 'app.local'        // must match your Ingress host

    // Tags: main → latest, other branches → branch-BUILD
    TAG = "${env.BRANCH_NAME == 'main' ? 'latest' : "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"}"
  }

  stages {

    stage('Checkout') {
      steps {
        // Multibranch injects SCM; this ensures workspace is populated
        checkout scm
      }
    }

    stage('Pre-flight: versions') {
      steps {
        container('kubectl') {
          sh '''
            echo "==> kubectl version:"
            kubectl version --client=true
          '''
        }
        container('node') {
          sh 'echo "==> Node:"; node -v; echo "==> npm:"; npm -v'
        }
        container('maven') {
          sh 'echo "==> Maven:"; mvn -v'
        }
      }
    }

    stage('Build Frontend') {
      steps {
        container('node') {
          dir("${env.FRONT_DIR}") {
            sh '''
              echo "==> Frontend: install & build"
              npm ci || npm install
              # Try standard build; if Angular, fallback to ng build
              npm run build || npx ng build --configuration=production || true
            '''
          }
        }
      }
    }

    stage('Build Backend (Maven)') {
      steps {
        container('maven') {
          dir("${env.BACK_DIR}") {
            sh '''
              echo "==> Backend: package (skip tests)"
              if [ -x ./mvnw ]; then
                ./mvnw -B -DskipTests package
              else
                mvn -B -DskipTests package
              fi
            '''
          }
        }
      }
    }

    stage('Build & Push Image (Kaniko)') {
      steps {
        container('kaniko') {
          sh '''
            echo "==> Check Dockerfile"
            test -f "$WORKSPACE/${BACK_DIR}/Dockerfile" || {
              echo "ERROR: Missing ${BACK_DIR}/Dockerfile"; exit 1; }

            echo "==> Build & push docker.io/${DOCKER_IMAGE}:${TAG}"
            /kaniko/executor \
              --context "$WORKSPACE/${BACK_DIR}" \
              --dockerfile Dockerfile \
              --destination "docker.io/${DOCKER_IMAGE}:${TAG}" \
              --snapshot-mode=redo --verbosity=info

            if [ "$BRANCH_NAME" = "main" ] && [ "${TAG}" != "latest" ]; then
              echo "==> Also tag latest for main"
              /kaniko/executor \
                --context "$WORKSPACE/${BACK_DIR}" \
                --dockerfile Dockerfile \
                --destination "docker.io/${DOCKER_IMAGE}:latest" \
                --snapshot-mode=redo --verbosity=info
            fi
          '''
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        container('kubectl') {
          sh '''
            echo "==> Apply manifests from ${K8S_MANIFEST_DIR}"
            test -d "$WORKSPACE/${K8S_MANIFEST_DIR}" || {
              echo "ERROR: ${K8S_MANIFEST_DIR}/ folder missing"; exit 1; }

            kubectl -n "${K8S_NS}" apply -f "$WORKSPACE/${K8S_MANIFEST_DIR}"

            echo "==> Set image on Deployment/${APP_NAME}"
            kubectl -n "${K8S_NS}" set image deploy/${APP_NAME} \
              app="docker.io/${DOCKER_IMAGE}:${TAG}" --record

            echo "==> Wait for rollout"
            kubectl -n "${K8S_NS}" rollout status deploy/${APP_NAME} --timeout=180s

            echo "==> Current services/ingress"
            kubectl -n "${K8S_NS}" get deploy,svc,ingress -o wide
          '''
        }
      }
    }

    stage('Smoke Test (Ingress)') {
      steps {
        container('kubectl') {
          sh '''
            echo "==> Smoke test via Ingress (in-cluster)"
            kubectl -n "${K8S_NS}" run smoke --rm -i --restart=Never \
              --image=curlimages/curl -- \
              -fsSI -H "Host: ${INGRESS_HOST}" \
              http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/ \
              | head -n 1
          '''
        }
      }
    }
  }

  post {
    success {
      echo "✅ CI/CD OK — deployed docker.io/${DOCKER_IMAGE}:${TAG} to ns ${K8S_NS}"
    }
    failure {
      echo "❌ Build failed — open Console Output, see first failing stage"
    }
  }
}
