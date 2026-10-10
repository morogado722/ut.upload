"""Bounded prototype settings; stage descriptions are editable AI suggestions, not policy."""
import os

PIPELINE_VERSION = '2.0'
MAX_FILES = 20
MAX_FILE = 50 * 1024 * 1024
MAX_TOTAL = 100 * 1024 * 1024
MAX_SOURCES = 60  # including children of archives
MAX_TEXT = 24000
MAX_TEXT_PAGES = 40
MAX_PAGE_PREVIEWS = 8
MAX_THUMBNAILS = 60
MAX_PREVIEW_BYTES = 20 * 1024 * 1024  # sum of binary JPEG/PNG previews per request
MAX_EXPANDED_BYTES = 200 * 1024 * 1024
MAX_ARCHIVE_DEPTH = 2
MAX_ZIP_ENTRIES = 1500
MAX_MEMBER = 50 * 1024 * 1024
MAX_ZIP_RATIO = 400
MAX_AI_TEXT = 96000
MAX_AI_IMAGES = 40
MAX_VIDEO_FRAMES = 6
MAX_AUDIO_SECONDS = 120
MAX_AUDIO_FILES = 3
PARSER_SECONDS = 120
AI_SECONDS = 95

# Provisional analysis rubric, deliberately isolated from UI/business policy.
# Flowering is NEVER inferred or awarded by this pipeline.
STAGE_RUBRIC = {
    'Seeding': '아이디어, 문제의식, 짧은 메모·참고 자료 중심. 구체적인 작업물의 증거가 부족함.',
    'Planting': '의도·구성이 구체화되고 초기 스케치, 구조, 첫 실험이 보임.',
    'Growing': '여러 구성요소를 실제로 제작·구현하는 중이며 남은 작업이나 수정 중인 부분이 보임.',
    'Blooming': '주요 구성과 결과물이 갖춰져 마무리·검토 단계라는 근거가 있음. 미적으로 예쁘다는 이유만으로 부여하지 않음.',
}

def office_enabled():
    return os.getenv('ENABLE_OFFICE_RENDER', '0').lower() in ('1','true','yes')
