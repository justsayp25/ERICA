Pod::Spec.new do |s|
  s.name           = 'ForegroundService'
  s.version        = '0.1.0'
  s.summary        = 'Modular ForegroundService for ERICA'
  s.description    = 'Minimal Android ForegroundService and WakeLock manager for ERICA'
  s.author         = 'ERICA Team'
  s.homepage       = 'https://github.com/justsayp25/ERICA'
  s.platform       = :ios, '15.1'
  s.source         = { :git => '' }
  s.source_files   = '**/*.{h,m,mm,swift,hpp,cpp}'
  s.dependency 'ExpoModulesCore'
end
