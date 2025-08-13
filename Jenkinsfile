pipeline {
  agent any
  options { skipDefaultCheckout(false) }
  triggers { githubPush() }  // webhook triggers

  stages {
    stage('Info') {
      steps {
        sh '''
          echo "Branch: $BRANCH_NAME"
          echo "Workspace: $PWD"
          ls -la
        '''
      }
    }

    stage('Prepare Frontend') {
      steps {
        sh '''
          if [ -d "employee frontend final" ]; then
            echo "==> Front dir exists"
            find "employee frontend final" -maxdepth 2 -type f | wc -l
          else
            echo "Front directory not found"; exit 1
          fi
        '''
      }
    }

    stage('Prepare Backend') {
      steps {
        sh '''
          if [ -d "emp_backend" ]; then
            echo "==> Backend dir exists"
            ls -la emp_backend
          else
            echo "Backend directory not found (ok if you don't need it now)"
          fi
        '''
      }
    }

    stage('Package Artifacts') {
      steps {
        sh '''
          rm -rf artifacts && mkdir -p artifacts
          # Archive frontend as static site (adjust if needed)
          tar -czf artifacts/frontend.tar.gz "employee frontend final" || true
          # Archive backend sources (until we add real build)
          tar -czf artifacts/backend-src.tar.gz emp_backend || true
          ls -lh artifacts
        '''
        archiveArtifacts artifacts: 'artifacts/*.tar.gz', fingerprint: true
      }
    }
  }

  post {
    success { echo '✅ Build OK — artifacts archived.' }
    failure { echo '❌ Build failed — check which stage.' }
  }
}
