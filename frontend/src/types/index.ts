export interface TopicImage {
  image_id?: number
  type?: string
  url?: string
  thumbnail?: {
    url: string
    width?: number
    height?: number
  }
  large?: {
    url: string
    width?: number
    height?: number
  }
}

export interface Topic {
  id: number
  platform: string
  title: string | null
  content: string
  content_type: string
  url: string | null
  like_count: number
  comment_count: number
  images: TopicImage[] | null
  published_at: string | null
}

export interface Comment {
  id: number
  author_name: string | null
  content: string
  like_count: number
  images: TopicImage[] | null
  published_at: string | null
}

export interface CrawlTask {
  id: number
  platform: string
  status: 'pending' | 'running' | 'done' | 'error'
  topics_count: number
  comments_count: number
  error_message: string | null
  started_at: string | null
  finished_at: string | null
}

export interface PaginatedResponse<T> {
  total: number
  page: number
  page_size: number
  items: T[]
}
