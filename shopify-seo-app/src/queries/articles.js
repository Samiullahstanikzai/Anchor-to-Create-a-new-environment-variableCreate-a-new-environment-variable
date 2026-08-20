import { SEO_METAFIELDS_FRAGMENT, extractSeoFields } from "./shared.js";

// Blog articles are nested under their parent blog in the Admin GraphQL API,
// so listing "all articles" means paging through each blog. As with pages.js,
// verify field names in GraphiQL for the API version you deploy against.
export const LIST_BLOGS_QUERY = `
  query ListBlogs($first: Int!, $after: String) {
    blogs(first: $first, after: $after) {
      edges { cursor node { id title } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const LIST_ARTICLES_FOR_BLOG_QUERY = `
  query ListArticlesForBlog($blogId: ID!, $first: Int!, $after: String) {
    blog(id: $blogId) {
      id
      title
      articles(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            title
            handle
            body
            ${SEO_METAFIELDS_FRAGMENT}
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

export const GET_ARTICLE_QUERY = `
  query GetArticle($id: ID!) {
    article(id: $id) {
      id
      title
      handle
      body
      blog { id title }
      ${SEO_METAFIELDS_FRAGMENT}
    }
  }
`;

export const UPDATE_ARTICLE_HANDLE_MUTATION = `
  mutation UpdateArticleHandle($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article { id handle }
      userErrors { field message }
    }
  }
`;

export function normalizeArticle(node, blog) {
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    bodyHtml: node.body,
    blogId: blog?.id,
    blogTitle: blog?.title,
    ...extractSeoFields(node),
  };
}
